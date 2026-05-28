import { FilesetResolver, HandLandmarker } from '../../vendor/tasks-vision/vision_bundle.mjs';

import { CONFIG } from '../shared/config.js';
import { GESTURES } from '../shared/gestures.js';
import { MSG } from '../shared/messages.js';

const LOCAL_WASM_BASE  = new URL('../../vendor/tasks-vision/wasm', import.meta.url).href;
const LOCAL_MODEL_PATH = chrome.runtime.getURL('src/libs/mediapipe/hand_landmarker.task');

const video = document.querySelector('#camera-feed');

const runtime = {
  running: false,
  stream: null,
  handLandmarker: null,
  backend: '-',
  rafId: null,
  frameCount: 0,
  lastFpsTs: performance.now(),
  fps: 0,
  statusClockMs: 0,

  cooldownUntil: 0,
  candidateGesture: null,
  candidateSince: 0,
  candidatePeakConfidence: 0,

  handDetected: false,
  openPalmConfidence: 0,
  closedFistConfidence: 0,
  swipeRightConfidence: 0,
  swipeLeftConfidence: 0,
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
  if (!msg || typeof msg.type !== 'string') return buildStatus();
  switch (msg.type) {
    case MSG.OFFSCREEN_START: await start(); return buildStatus();
    case MSG.OFFSCREEN_STOP:  await stop();  return buildStatus();
    case MSG.GET_STATUS:                     return buildStatus();
    default:                                 return buildStatus();
  }
}

async function start() {
  if (runtime.running) return;
  runtime.lastError = null;

  if (!runtime.handLandmarker) {
    runtime.handLandmarker = await createHandLandmarker();
  }

  runtime.stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: CONFIG.VIDEO_WIDTH }, height: { ideal: CONFIG.VIDEO_HEIGHT }, facingMode: 'user' },
    audio: false
  });

  video.srcObject = runtime.stream;
  await video.play();

  runtime.running            = true;
  runtime.frameCount         = 0;
  runtime.fps                = 0;
  runtime.lastFpsTs          = performance.now();
  runtime.statusClockMs      = 0;
  runtime.cooldownUntil      = 0;
  runtime.candidateGesture   = null;
  runtime.candidateSince     = 0;
  runtime.candidatePeakConfidence = 0;

  runtime.rafId = requestAnimationFrame((ts) => loop(ts));
}

async function stop() {
  runtime.running = false;
  if (runtime.rafId !== null) { cancelAnimationFrame(runtime.rafId); runtime.rafId = null; }
  if (runtime.stream) { runtime.stream.getTracks().forEach((t) => t.stop()); runtime.stream = null; }
  video.srcObject = null;

  runtime.handDetected          = false;
  runtime.openPalmConfidence    = 0;
  runtime.closedFistConfidence  = 0;
  runtime.swipeRightConfidence  = 0;
  runtime.swipeLeftConfidence   = 0;
  runtime.candidateGesture      = null;
  runtime.candidateSince        = 0;
  runtime.candidatePeakConfidence = 0;
  runtime.cooldownUntil         = 0;
  runtime.fps                   = 0;

  await pushStatus();
}

async function createHandLandmarker() {
  let fileset;
  try   { fileset = await FilesetResolver.forVisionTasks(LOCAL_WASM_BASE); }
  catch { fileset = await FilesetResolver.forVisionTasks(CONFIG.WASM_CDN_BASE); }

  const shared = {
    runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence:  0.6,
    minTrackingConfidence:      0.5
  };

  try {
    runtime.backend = 'GPU';
    return await HandLandmarker.createFromOptions(fileset,
      { baseOptions: { modelAssetPath: LOCAL_MODEL_PATH, delegate: 'GPU' }, ...shared });
  } catch {
    runtime.backend = 'CPU';
    return await HandLandmarker.createFromOptions(fileset,
      { baseOptions: { modelAssetPath: LOCAL_MODEL_PATH, delegate: 'CPU' }, ...shared });
  }
}

// ── Loop ──────────────────────────────────────────────────────

function loop(nowMs) {
  if (!runtime.running || !runtime.handLandmarker) return;
  runtime.rafId = requestAnimationFrame((ts) => loop(ts));

  runtime.frameCount += 1;
  const elapsed = nowMs - runtime.lastFpsTs;
  if (elapsed >= 1000) {
    runtime.fps       = Math.round((runtime.frameCount * 1000) / elapsed);
    runtime.frameCount = 0;
    runtime.lastFpsTs  = nowMs;
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

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

// ── Detection ─────────────────────────────────────────────────

function processDetection(detection, nowMs) {
  const hand = detection?.landmarks?.[0];

  if (!hand || hand.length < 21) {
    runtime.handDetected         = false;
    runtime.openPalmConfidence   = 0;
    runtime.closedFistConfidence = 0;
    runtime.swipeRightConfidence = 0;
    runtime.swipeLeftConfidence  = 0;
    resetCandidate();
    return;
  }

  runtime.handDetected         = true;
  runtime.openPalmConfidence   = computeOpenPalmConfidence(hand);
  runtime.closedFistConfidence = computeClosedFistConfidence(hand);
  runtime.swipeRightConfidence = computePointingDirConfidence(hand, 'right');
  runtime.swipeLeftConfidence  = computePointingDirConfidence(hand, 'left');

  processGestureFSM(nowMs);
}

function processGestureFSM(nowMs) {
  if (nowMs < runtime.cooldownUntil) return;

  // Prioridad: palma > puño > swipe der > swipe izq
  let gesture    = null;
  let confidence = 0;

  if (runtime.openPalmConfidence >= CONFIG.OPEN_PALM_THRESHOLD) {
    gesture    = GESTURES.OPEN_PALM;
    confidence = runtime.openPalmConfidence;
  } else if (runtime.closedFistConfidence >= CONFIG.CLOSED_FIST_THRESHOLD) {
    gesture    = GESTURES.FIST;
    confidence = runtime.closedFistConfidence;
  } else if (runtime.swipeRightConfidence >= CONFIG.SWIPE_POINT_THRESHOLD) {
    gesture    = GESTURES.SWIPE_RIGHT;
    confidence = runtime.swipeRightConfidence;
  } else if (runtime.swipeLeftConfidence >= CONFIG.SWIPE_POINT_THRESHOLD) {
    gesture    = GESTURES.SWIPE_LEFT;
    confidence = runtime.swipeLeftConfidence;
  }

  if (!gesture) { resetCandidate(); return; }

  if (runtime.candidateGesture !== gesture) {
    runtime.candidateGesture        = gesture;
    runtime.candidateSince          = nowMs;
    runtime.candidatePeakConfidence = confidence;
    return;
  }

  runtime.candidatePeakConfidence = Math.max(runtime.candidatePeakConfidence, confidence);
  if (nowMs - runtime.candidateSince < CONFIG.HOLD_MS) return;

  // Confirmado
  void chrome.runtime.sendMessage({
    type: MSG.GESTURE_DETECTED,
    gesture,
    payload: { confidence: runtime.candidatePeakConfidence, timestampMs: nowMs }
  }).catch(() => {});

  runtime.cooldownUntil = nowMs + CONFIG.COOLDOWN_MS;
  resetCandidate();
}

function resetCandidate() {
  runtime.candidateGesture        = null;
  runtime.candidateSince          = 0;
  runtime.candidatePeakConfidence = 0;
}

// ── Confidence scores ──────────────────────────────────────────

function computeOpenPalmConfidence(hand) {
  const wrist = hand[0];
  const chains = [
    { tip: 8,  pip: 6,  mcp: 5  },
    { tip: 12, pip: 10, mcp: 9  },
    { tip: 16, pip: 14, mcp: 13 },
    { tip: 20, pip: 18, mcp: 17 }
  ];
  let extendedCount = 0;
  for (const { tip, pip, mcp } of chains) {
    const upright = hand[tip].y < hand[pip].y && hand[pip].y < hand[mcp].y;
    if (distance(hand[tip], wrist) > distance(hand[pip], wrist) * 1.12 && upright) extendedCount++;
  }
  const tips   = [hand[8], hand[12], hand[16], hand[20]];
  const spread = averagePairwiseDistance(tips);
  return clamp01(
    clamp01((extendedCount - 2) / 2) * 0.75 +
    clamp01((spread - 0.08) / 0.15)  * 0.25
  );
}

function computeClosedFistConfidence(hand) {
  const wrist = hand[0];
  const chains = [
    [8,  6 ],   // índice: tip, pip
    [12, 10],   // medio
    [16, 14],   // anular
    [20, 18]    // meñique
  ];
  let curled = 0;
  for (const [tip, pip] of chains) {
    // Dedo cerrado: la punta está más cerca de la muñeca que el PIP
    if (distance(hand[tip], wrist) < distance(hand[pip], wrist)) curled++;
  }
  // Pulgar cerca del metacarpo del índice (landmark 5)
  const thumbIn = distance(hand[4], hand[5]) < 0.12;
  return clamp01((curled / 4) * 0.8 + (thumbIn ? 1 : 0) * 0.2);
}

function computePointingDirConfidence(hand, dir) {
  // Vector MCP (base) → TIP del índice en espacio espejado (como se ve en pantalla)
  const mcpX = 1 - hand[5].x;
  const mcpY =     hand[5].y;
  const tipX = 1 - hand[8].x;
  const tipY =     hand[8].y;

  const dx  = tipX - mcpX;
  const dy  = tipY - mcpY;
  const len = Math.hypot(dx, dy);

  // Dedo no extendido suficiente
  if (len < CONFIG.POINT_MIN_LEN) return 0;

  // Coseno del ángulo con el eje horizontal: cuanto más cerca de 1, más horizontal
  const cosH = Math.abs(dx) / len;
  if (cosH < CONFIG.POINT_MIN_COS) return 0;

  // Dirección correcta
  if (dir === 'right' && dx <= 0) return 0;
  if (dir === 'left'  && dx >= 0) return 0;

  const dirScore = clamp01((cosH          - CONFIG.POINT_MIN_COS) / (1 - CONFIG.POINT_MIN_COS));
  const lenScore = clamp01((len           - CONFIG.POINT_MIN_LEN) / 0.12);
  return clamp01(dirScore * 0.7 + lenScore * 0.3);
}

// ── Status / messaging ────────────────────────────────────────

function buildStatus() {
  return {
    running:              runtime.running,
    cameraActive:         runtime.running,
    backend:              runtime.backend,
    fps:                  runtime.fps,
    handDetected:         runtime.handDetected,
    openPalmConfidence:   runtime.openPalmConfidence,
    closedFistConfidence: runtime.closedFistConfidence,
    swipeRightConfidence: runtime.swipeRightConfidence,
    swipeLeftConfidence:  runtime.swipeLeftConfidence,
    candidate:            runtime.candidateGesture,
    cooldownRemainingMs:  Math.max(0, Math.ceil(runtime.cooldownUntil - performance.now())),
    lastError:            runtime.lastError
  };
}

async function pushStatus() {
  await chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_STATUS, payload: buildStatus() }).catch(() => {});
}

async function reportError(message) {
  await chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_ERROR, payload: { message } }).catch(() => {});
}

// ── Utils ─────────────────────────────────────────────────────

function distance(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function averagePairwiseDistance(points) {
  let sum = 0, count = 0;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) { sum += distance(points[i], points[j]); count++; }
  return sum / Math.max(1, count);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
