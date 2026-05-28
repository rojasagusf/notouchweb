import { FilesetResolver, HandLandmarker } from '../../vendor/tasks-vision/vision_bundle.mjs';

import { CONFIG } from '../shared/config.js';
import { GESTURES } from '../shared/gestures.js';
import { MSG } from '../shared/messages.js';

const LOCAL_WASM_BASE = new URL('../../vendor/tasks-vision/wasm', import.meta.url).href;

const video = document.querySelector('#camera-feed');

const runtime = {
  running: false,
  stream: null,
  handLandmarker: null,
  backend: '-',
  rafId: null,
  trajectory: [],
  frameCount: 0,
  lastFpsTs: performance.now(),
  fps: 0,
  statusClockMs: 0,

  candidateGesture: null,
  candidateSince: 0,
  candidatePeakConfidence: 0,
  cooldownUntil: 0,

  handDetected: false,
  openPalmConfidence: 0,
  swipeRightConfidence: 0,
  lastError: null
};

void chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_READY }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  void onMessage(msg)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      runtime.lastError = message;
      void reportError(message);
      sendResponse({ ok: false, error: message });
    });

  return true;
});

async function onMessage(msg) {
  if (!msg || typeof msg.type !== 'string') {
    return buildStatus();
  }

  switch (msg.type) {
    case MSG.OFFSCREEN_START:
      await start();
      return buildStatus();

    case MSG.OFFSCREEN_STOP:
      await stop();
      return buildStatus();

    case MSG.GET_STATUS:
      return buildStatus();

    default:
      return buildStatus();
  }
}

async function start() {
  if (runtime.running) {
    return;
  }

  runtime.lastError = null;

  if (!runtime.handLandmarker) {
    runtime.handLandmarker = await createHandLandmarker();
  }

  runtime.stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: CONFIG.VIDEO_WIDTH },
      height: { ideal: CONFIG.VIDEO_HEIGHT },
      facingMode: 'user'
    },
    audio: false
  });

  video.srcObject = runtime.stream;
  await video.play();

  runtime.running = true;
  runtime.trajectory = [];
  runtime.frameCount = 0;
  runtime.fps = 0;
  runtime.lastFpsTs = performance.now();
  runtime.statusClockMs = 0;

  runtime.candidateGesture = null;
  runtime.candidateSince = 0;
  runtime.candidatePeakConfidence = 0;
  runtime.cooldownUntil = 0;

  runtime.rafId = requestAnimationFrame((ts) => loop(ts));
}

async function stop() {
  runtime.running = false;

  if (runtime.rafId !== null) {
    cancelAnimationFrame(runtime.rafId);
    runtime.rafId = null;
  }

  if (runtime.stream) {
    for (const track of runtime.stream.getTracks()) {
      track.stop();
    }

    runtime.stream = null;
  }

  video.srcObject = null;
  runtime.trajectory = [];
  runtime.handDetected = false;
  runtime.openPalmConfidence = 0;
  runtime.swipeRightConfidence = 0;
  runtime.candidateGesture = null;
  runtime.candidateSince = 0;
  runtime.candidatePeakConfidence = 0;
  runtime.cooldownUntil = 0;
  runtime.fps = 0;

  await pushStatus();
}

async function createHandLandmarker() {
  let fileset;

  try {
    fileset = await FilesetResolver.forVisionTasks(LOCAL_WASM_BASE);
  } catch {
    fileset = await FilesetResolver.forVisionTasks(CONFIG.WASM_CDN_BASE);
  }

  try {
    runtime.backend = 'GPU';
    return await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: CONFIG.MODEL_URL_HAND_LANDMARKER,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
  } catch {
    runtime.backend = 'CPU';
    return await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: CONFIG.MODEL_URL_HAND_LANDMARKER,
        delegate: 'CPU'
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
  }
}

function loop(nowMs) {
  if (!runtime.running || !runtime.handLandmarker) {
    return;
  }

  runtime.rafId = requestAnimationFrame((ts) => loop(ts));

  runtime.frameCount += 1;

  const elapsedSinceFps = nowMs - runtime.lastFpsTs;
  if (elapsedSinceFps >= 1000) {
    runtime.fps = Math.round((runtime.frameCount * 1000) / elapsedSinceFps);
    runtime.frameCount = 0;
    runtime.lastFpsTs = nowMs;
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  try {
    const detection = runtime.handLandmarker.detectForVideo(video, nowMs);
    processDetection(detection, nowMs);
  } catch (error) {
    runtime.lastError = error instanceof Error ? error.message : String(error);
    void reportError(runtime.lastError);
    void stop();
    return;
  }

  runtime.statusClockMs += 16;
  if (runtime.statusClockMs >= CONFIG.STATUS_INTERVAL_MS) {
    runtime.statusClockMs = 0;
    void pushStatus();
  }
}

function processDetection(detection, nowMs) {
  const hand = detection?.landmarks?.[0];

  if (!hand || hand.length < 21) {
    runtime.handDetected = false;
    runtime.openPalmConfidence = 0;
    runtime.swipeRightConfidence = 0;
    runtime.trajectory = [];
    resetCandidate();
    return;
  }

  runtime.handDetected = true;

  const openPalmConfidence = computeOpenPalmConfidence(hand);
  const swipeRightConfidence = computeSwipeRightConfidence(hand, nowMs);

  runtime.openPalmConfidence = openPalmConfidence;
  runtime.swipeRightConfidence = swipeRightConfidence;

  processGestureFSM(openPalmConfidence, swipeRightConfidence, nowMs);
}

function processGestureFSM(openPalmConfidence, swipeRightConfidence, nowMs) {
  if (nowMs < runtime.cooldownUntil) {
    return;
  }

  let gesture = null;
  let confidence = 0;

  if (openPalmConfidence >= CONFIG.OPEN_PALM_THRESHOLD) {
    gesture = GESTURES.OPEN_PALM;
    confidence = openPalmConfidence;
  } else if (swipeRightConfidence >= CONFIG.SWIPE_RIGHT_THRESHOLD) {
    gesture = GESTURES.SWIPE_RIGHT;
    confidence = swipeRightConfidence;
  }

  if (!gesture) {
    resetCandidate();
    return;
  }

  if (runtime.candidateGesture !== gesture) {
    runtime.candidateGesture = gesture;
    runtime.candidateSince = nowMs;
    runtime.candidatePeakConfidence = confidence;
    return;
  }

  runtime.candidatePeakConfidence = Math.max(runtime.candidatePeakConfidence, confidence);

  if (nowMs - runtime.candidateSince < CONFIG.HOLD_MS) {
    return;
  }

  void chrome.runtime.sendMessage({
    type: MSG.GESTURE_DETECTED,
    gesture,
    payload: {
      confidence: runtime.candidatePeakConfidence,
      timestampMs: nowMs
    }
  }).catch(() => {});

  runtime.cooldownUntil = nowMs + CONFIG.COOLDOWN_MS;
  resetCandidate();
}

function resetCandidate() {
  runtime.candidateGesture = null;
  runtime.candidateSince = 0;
  runtime.candidatePeakConfidence = 0;
}

function computeOpenPalmConfidence(hand) {
  const wrist = hand[0];

  const chains = [
    { tip: 8, pip: 6, mcp: 5 },
    { tip: 12, pip: 10, mcp: 9 },
    { tip: 16, pip: 14, mcp: 13 },
    { tip: 20, pip: 18, mcp: 17 }
  ];

  let extendedCount = 0;

  for (const chain of chains) {
    const tip = hand[chain.tip];
    const pip = hand[chain.pip];
    const mcp = hand[chain.mcp];

    const tipDist = distance(tip, wrist);
    const pipDist = distance(pip, wrist);
    const upright = tip.y < pip.y && pip.y < mcp.y;

    if (tipDist > pipDist * 1.12 && upright) {
      extendedCount += 1;
    }
  }

  const tips = [hand[8], hand[12], hand[16], hand[20]];
  const spread = averagePairwiseDistance(tips);

  const extensionScore = clamp01((extendedCount - 2) / 2);
  const spreadScore = clamp01((spread - 0.08) / 0.15);

  return clamp01(extensionScore * 0.75 + spreadScore * 0.25);
}

function computeSwipeRightConfidence(hand, nowMs) {
  const wrist = hand[0];
  const mirroredX = 1 - wrist.x;
  const y = wrist.y;

  runtime.trajectory.push({ t: nowMs, x: mirroredX, y });
  const minTs = nowMs - CONFIG.SWIPE_WINDOW_MS;
  runtime.trajectory = runtime.trajectory.filter((entry) => entry.t >= minTs);

  if (runtime.trajectory.length < 4) {
    return 0;
  }

  const first = runtime.trajectory[0];
  const last = runtime.trajectory[runtime.trajectory.length - 1];
  const deltaX = last.x - first.x;

  if (deltaX <= 0) {
    return 0;
  }

  let minY = first.y;
  let maxY = first.y;

  for (const point of runtime.trajectory) {
    if (point.y < minY) {
      minY = point.y;
    }
    if (point.y > maxY) {
      maxY = point.y;
    }
  }

  const driftY = Math.abs(maxY - minY);
  if (driftY > CONFIG.SWIPE_MAX_DRIFT_Y) {
    return 0;
  }

  return clamp01((deltaX - CONFIG.SWIPE_MIN_DELTA) / 0.18);
}

function buildStatus() {
  return {
    running: runtime.running,
    cameraActive: runtime.running,
    backend: runtime.backend,
    fps: runtime.fps,
    handDetected: runtime.handDetected,
    openPalmConfidence: runtime.openPalmConfidence,
    swipeRightConfidence: runtime.swipeRightConfidence,
    candidate: runtime.candidateGesture,
    cooldownRemainingMs: Math.max(0, Math.ceil(runtime.cooldownUntil - performance.now())),
    lastError: runtime.lastError
  };
}

async function pushStatus() {
  await chrome.runtime.sendMessage({
    type: MSG.OFFSCREEN_STATUS,
    payload: buildStatus()
  }).catch(() => {});
}

async function reportError(message) {
  await chrome.runtime.sendMessage({
    type: MSG.OFFSCREEN_ERROR,
    payload: { message }
  }).catch(() => {});
}

function distance(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  return Math.hypot(dx, dy);
}

function averagePairwiseDistance(points) {
  if (points.length < 2) {
    return 0;
  }

  let sum = 0;
  let count = 0;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      sum += distance(points[i], points[j]);
      count += 1;
    }
  }

  return sum / Math.max(1, count);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
