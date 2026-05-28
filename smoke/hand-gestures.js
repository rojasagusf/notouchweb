import { FilesetResolver, HandLandmarker } from "../vendor/mediapipe/tasks-vision/vision_bundle.mjs";

const LOCAL_WASM_BASE = new URL("../vendor/mediapipe/tasks-vision/wasm", import.meta.url).href;
const CDN_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const SETTINGS = {
  openPalmThreshold: 0.78,
  swipeThreshold: 0.72,
  holdMs: 180,
  cooldownMs: 1200,
  swipeWindowMs: 280,
  minSwipeDelta: 0.16,
  maxSwipeDriftY: 0.1,
  debugLogLimit: 14
};

const COMMANDS = {
  OPEN_PALM: "TOGGLE_PLAYBACK",
  SWIPE_RIGHT: "NEXT_TRACK"
};

const ui = {
  startBtn: document.querySelector("#start-btn"),
  stopBtn: document.querySelector("#stop-btn"),
  status: document.querySelector("#status"),
  backend: document.querySelector("#backend"),
  fps: document.querySelector("#fps"),
  hand: document.querySelector("#hand"),
  openPalm: document.querySelector("#open-palm"),
  swipeRight: document.querySelector("#swipe-right"),
  candidate: document.querySelector("#candidate"),
  cooldown: document.querySelector("#cooldown"),
  command: document.querySelector("#command"),
  error: document.querySelector("#error"),
  eventLog: document.querySelector("#event-log")
};

const video = document.querySelector("#video");
const videoCanvas = document.querySelector("#video-canvas");
const overlayCanvas = document.querySelector("#overlay-canvas");
const videoCtx = videoCanvas.getContext("2d", { alpha: false });
const overlayCtx = overlayCanvas.getContext("2d", { alpha: true });

const state = {
  running: false,
  stream: null,
  handLandmarker: null,
  backend: "-",
  rafId: null,
  frameCount: 0,
  lastFpsTs: performance.now(),
  trajectory: [],
  cooldownUntil: 0,
  candidateGesture: null,
  candidateSince: 0,
  candidatePeakConfidence: 0,
  lastCommand: null,
  lastCommandAt: 0,
  events: []
};

ui.startBtn.addEventListener("click", () => {
  void start();
});

ui.stopBtn.addEventListener("click", () => {
  void stop();
});

setStatus("idle");

async function start() {
  if (state.running) {
    return;
  }

  setError("-");
  setStatus("initializing");

  try {
    if (!state.handLandmarker) {
      state.handLandmarker = await createHandLandmarker();
    }

    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    });

    video.srcObject = state.stream;
    await video.play();

    const width = Math.max(1, video.videoWidth);
    const height = Math.max(1, video.videoHeight);
    videoCanvas.width = width;
    videoCanvas.height = height;
    overlayCanvas.width = width;
    overlayCanvas.height = height;

    state.running = true;
    state.frameCount = 0;
    state.lastFpsTs = performance.now();
    state.trajectory = [];
    state.cooldownUntil = 0;
    state.candidateGesture = null;
    state.candidateSince = 0;
    state.candidatePeakConfidence = 0;

    setStatus("running");
    pushEvent("runtime started");

    loop();
  } catch (error) {
    setStatus("error");
    setError(getErrorMessage(error));
  }
}

function stop() {
  state.running = false;

  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
    state.stream = null;
  }

  video.srcObject = null;
  state.trajectory = [];
  state.candidateGesture = null;
  state.candidateSince = 0;
  state.candidatePeakConfidence = 0;

  clearCanvases();
  setStatus("stopped");
  ui.hand.textContent = "not_detected";
  ui.openPalm.textContent = "0.00";
  ui.swipeRight.textContent = "0.00";
  ui.candidate.textContent = "-";
  ui.cooldown.textContent = "ready";

  pushEvent("runtime stopped");
}

async function createHandLandmarker() {
  let fileset;

  try {
    fileset = await FilesetResolver.forVisionTasks(LOCAL_WASM_BASE);
  } catch {
    fileset = await FilesetResolver.forVisionTasks(CDN_WASM_BASE);
  }

  try {
    state.backend = "GPU";
    setBackend("GPU");

    return await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: HAND_MODEL_URL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
  } catch {
    state.backend = "CPU";
    setBackend("CPU");

    return await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: HAND_MODEL_URL,
        delegate: "CPU"
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
  }
}

function loop() {
  if (!state.running || !state.handLandmarker) {
    return;
  }

  state.frameCount += 1;

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    drawMirroredVideo();
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    try {
      const nowMs = performance.now();
      const result = state.handLandmarker.detectForVideo(video, nowMs);
      handleDetection(result, nowMs);
      updateFps(nowMs);
    } catch (error) {
      setStatus("error");
      setError(getErrorMessage(error));
      stop();
      return;
    }
  }

  state.rafId = requestAnimationFrame(loop);
}

function handleDetection(result, nowMs) {
  const landmarksList = result?.landmarks ?? [];
  const hand = landmarksList[0];

  if (!hand || hand.length < 21) {
    ui.hand.textContent = "not_detected";
    ui.openPalm.textContent = "0.00";
    ui.swipeRight.textContent = "0.00";
    state.trajectory = [];
    resetCandidate();
    updateCooldown(nowMs);
    return;
  }

  ui.hand.textContent = "detected";

  drawHand(hand);

  const openPalmConfidence = computeOpenPalmConfidence(hand);
  const swipeConfidence = computeSwipeRightConfidence(hand, nowMs);

  ui.openPalm.textContent = openPalmConfidence.toFixed(2);
  ui.swipeRight.textContent = swipeConfidence.toFixed(2);

  processGestureFSM({ openPalmConfidence, swipeConfidence }, nowMs);
  updateCooldown(nowMs);
}

function processGestureFSM(confidence, nowMs) {
  if (nowMs < state.cooldownUntil) {
    ui.candidate.textContent = "cooldown";
    return;
  }

  const nextCandidate = pickCandidate(confidence);

  if (!nextCandidate) {
    resetCandidate();
    return;
  }

  if (state.candidateGesture !== nextCandidate.gesture) {
    state.candidateGesture = nextCandidate.gesture;
    state.candidateSince = nowMs;
    state.candidatePeakConfidence = nextCandidate.value;
    ui.candidate.textContent = `${nextCandidate.gesture} (${nextCandidate.value.toFixed(2)})`;
    return;
  }

  state.candidatePeakConfidence = Math.max(state.candidatePeakConfidence, nextCandidate.value);
  ui.candidate.textContent = `${state.candidateGesture} (${state.candidatePeakConfidence.toFixed(2)})`;

  if (nowMs - state.candidateSince < SETTINGS.holdMs) {
    return;
  }

  emitCommand(state.candidateGesture, state.candidatePeakConfidence, nowMs);
  state.cooldownUntil = nowMs + SETTINGS.cooldownMs;
  resetCandidate();
}

function pickCandidate(confidence) {
  if (confidence.openPalmConfidence >= SETTINGS.openPalmThreshold) {
    return {
      gesture: "open_palm",
      value: confidence.openPalmConfidence
    };
  }

  if (confidence.swipeRightConfidence >= SETTINGS.swipeThreshold) {
    return {
      gesture: "swipe_right",
      value: confidence.swipeRightConfidence
    };
  }

  return null;
}

function emitCommand(gesture, confidence, nowMs) {
  const command = gesture === "open_palm" ? COMMANDS.OPEN_PALM : COMMANDS.SWIPE_RIGHT;
  state.lastCommand = command;
  state.lastCommandAt = nowMs;

  ui.command.textContent = `${command} (${confidence.toFixed(2)})`;
  pushEvent(`${new Date().toLocaleTimeString()} -> ${gesture} => ${command} (${confidence.toFixed(2)})`);
}

function resetCandidate() {
  state.candidateGesture = null;
  state.candidateSince = 0;
  state.candidatePeakConfidence = 0;
  ui.candidate.textContent = "-";
}

function computeOpenPalmConfidence(hand) {
  const wrist = hand[0];

  const fingerChains = [
    { tip: 8, pip: 6, mcp: 5 },
    { tip: 12, pip: 10, mcp: 9 },
    { tip: 16, pip: 14, mcp: 13 },
    { tip: 20, pip: 18, mcp: 17 }
  ];

  let extendedCount = 0;

  for (const chain of fingerChains) {
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

  state.trajectory.push({ t: nowMs, x: mirroredX, y });
  const minTs = nowMs - SETTINGS.swipeWindowMs;
  state.trajectory = state.trajectory.filter((sample) => sample.t >= minTs);

  if (state.trajectory.length < 4) {
    return 0;
  }

  const first = state.trajectory[0];
  const last = state.trajectory[state.trajectory.length - 1];
  const deltaX = last.x - first.x;

  if (deltaX <= 0) {
    return 0;
  }

  let minY = first.y;
  let maxY = first.y;
  for (const sample of state.trajectory) {
    if (sample.y < minY) {
      minY = sample.y;
    }
    if (sample.y > maxY) {
      maxY = sample.y;
    }
  }

  const driftY = Math.abs(maxY - minY);
  if (driftY > SETTINGS.maxSwipeDriftY) {
    return 0;
  }

  return clamp01((deltaX - SETTINGS.minSwipeDelta) / 0.18);
}

function drawMirroredVideo() {
  videoCtx.save();
  videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  videoCtx.translate(videoCanvas.width, 0);
  videoCtx.scale(-1, 1);
  videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
  videoCtx.restore();
}

function drawHand(hand) {
  const width = overlayCanvas.width;
  const height = overlayCanvas.height;

  overlayCtx.lineWidth = 2;
  overlayCtx.strokeStyle = "rgba(56, 189, 248, 0.95)";

  for (const connection of HandLandmarker.HAND_CONNECTIONS) {
    const start = hand[connection.start];
    const end = hand[connection.end];
    if (!start || !end) {
      continue;
    }

    const x1 = (1 - start.x) * width;
    const y1 = start.y * height;
    const x2 = (1 - end.x) * width;
    const y2 = end.y * height;

    overlayCtx.beginPath();
    overlayCtx.moveTo(x1, y1);
    overlayCtx.lineTo(x2, y2);
    overlayCtx.stroke();
  }

  overlayCtx.fillStyle = "rgba(248, 250, 252, 0.95)";
  for (const landmark of hand) {
    const x = (1 - landmark.x) * width;
    const y = landmark.y * height;
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 3, 0, Math.PI * 2);
    overlayCtx.fill();
  }
}

function updateFps(nowMs) {
  const elapsed = nowMs - state.lastFpsTs;
  if (elapsed < 1000) {
    return;
  }

  const fps = Math.round((state.frameCount * 1000) / elapsed);
  ui.fps.textContent = String(fps);
  state.frameCount = 0;
  state.lastFpsTs = nowMs;
}

function updateCooldown(nowMs) {
  if (nowMs >= state.cooldownUntil) {
    ui.cooldown.textContent = "ready";
    return;
  }

  const remaining = Math.ceil((state.cooldownUntil - nowMs) / 10) * 10;
  ui.cooldown.textContent = `${remaining}ms`;
}

function clearCanvases() {
  videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function setStatus(value) {
  ui.status.textContent = value;
}

function setBackend(value) {
  ui.backend.textContent = value;
}

function setError(value) {
  ui.error.textContent = value;
}

function pushEvent(line) {
  state.events.unshift(line);
  if (state.events.length > SETTINGS.debugLogLimit) {
    state.events.length = SETTINGS.debugLogLimit;
  }

  ui.eventLog.textContent = state.events.join("\n");
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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

  let accum = 0;
  let count = 0;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      accum += distance(points[i], points[j]);
      count += 1;
    }
  }

  return accum / Math.max(1, count);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
