import { FilesetResolver, ImageSegmenter } from "../vendor/mediapipe/tasks-vision/vision_bundle.mjs";

const LOCAL_WASM_BASE = new URL("../vendor/mediapipe/tasks-vision/wasm", import.meta.url).href;
const CDN_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

const ui = {
  startBtn: document.querySelector("#start-btn"),
  stopBtn: document.querySelector("#stop-btn"),
  status: document.querySelector("#status"),
  backend: document.querySelector("#backend"),
  fps: document.querySelector("#fps"),
  ratio: document.querySelector("#ratio"),
  maskSize: document.querySelector("#mask-size"),
  error: document.querySelector("#error")
};

const video = document.querySelector("#video");
const videoCanvas = document.querySelector("#video-canvas");
const maskCanvas = document.querySelector("#mask-canvas");

const videoCtx = videoCanvas.getContext("2d", { alpha: false });
const maskCtx = maskCanvas.getContext("2d", { alpha: true });

const state = {
  running: false,
  stream: null,
  segmenter: null,
  rafId: null,
  frameCount: 0,
  lastFpsTs: performance.now(),
  maskBufferCanvas: document.createElement("canvas"),
  backend: "-"
};

ui.startBtn.addEventListener("click", () => {
  void start();
});

ui.stopBtn.addEventListener("click", () => {
  stop();
});

setStatus("idle");

async function start() {
  if (state.running) {
    return;
  }

  setError("-");
  setStatus("initializing");

  try {
    if (!state.segmenter) {
      state.segmenter = await createSegmenter();
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
    maskCanvas.width = width;
    maskCanvas.height = height;

    state.running = true;
    state.frameCount = 0;
    state.lastFpsTs = performance.now();
    setStatus("running");

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
  clearCanvases();
  setStatus("stopped");
}

async function createSegmenter() {
  let fileset;

  try {
    fileset = await FilesetResolver.forVisionTasks(LOCAL_WASM_BASE);
  } catch {
    fileset = await FilesetResolver.forVisionTasks(CDN_WASM_BASE);
  }

  try {
    state.backend = "GPU";
    setBackend(state.backend);

    return await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      outputConfidenceMasks: true
    });
  } catch {
    state.backend = "CPU";
    setBackend(state.backend);

    return await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "CPU"
      },
      runningMode: "VIDEO",
      outputConfidenceMasks: true
    });
  }
}

function loop() {
  if (!state.running || !state.segmenter) {
    return;
  }

  state.frameCount += 1;

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);

    try {
      const ts = performance.now();
      const result = state.segmenter.segmentForVideo(video, ts);
      drawMask(result);
      updateFps(ts);
    } catch (error) {
      setStatus("error");
      setError(getErrorMessage(error));
      stop();
      return;
    }
  }

  state.rafId = requestAnimationFrame(loop);
}

function drawMask(result) {
  const confidenceMask = result?.confidenceMasks?.[0];
  const categoryMask = result?.categoryMask;

  let width = 0;
  let height = 0;
  let floatData = null;

  if (confidenceMask?.getAsFloat32Array) {
    floatData = confidenceMask.getAsFloat32Array();
    width = confidenceMask.width ?? 0;
    height = confidenceMask.height ?? 0;
    confidenceMask.close?.();
  } else if (categoryMask?.getAsUint8Array) {
    const raw = categoryMask.getAsUint8Array();
    width = categoryMask.width ?? 0;
    height = categoryMask.height ?? 0;
    floatData = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      floatData[i] = raw[i] / 255;
    }
    categoryMask.close?.();
  }

  if (!floatData || width <= 0 || height <= 0 || width * height !== floatData.length) {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    ui.maskSize.textContent = "-";
    ui.ratio.textContent = "0.000";
    return;
  }

  ui.maskSize.textContent = `${width}x${height}`;

  state.maskBufferCanvas.width = width;
  state.maskBufferCanvas.height = height;
  const maskBufferCtx = state.maskBufferCanvas.getContext("2d", { willReadFrequently: true });

  if (!maskBufferCtx) {
    return;
  }

  const maskImage = maskBufferCtx.createImageData(width, height);

  let foregroundCount = 0;
  for (let i = 0; i < floatData.length; i += 1) {
    const confidence = clamp01(floatData[i] ?? 0);
    if (confidence > 0.5) {
      foregroundCount += 1;
    }

    const rgbaIndex = i * 4;
    maskImage.data[rgbaIndex] = Math.round(confidence * 255);
    maskImage.data[rgbaIndex + 1] = Math.round(confidence * 180);
    maskImage.data[rgbaIndex + 2] = 255;
    maskImage.data[rgbaIndex + 3] = Math.round(confidence * 220);
  }

  maskBufferCtx.putImageData(maskImage, 0, 0);

  const ratio = foregroundCount / Math.max(1, floatData.length);
  ui.ratio.textContent = ratio.toFixed(3);

  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(state.maskBufferCanvas, 0, 0, maskCanvas.width, maskCanvas.height);
}

function updateFps(ts) {
  const elapsed = ts - state.lastFpsTs;
  if (elapsed < 1000) {
    return;
  }

  const fps = Math.round((state.frameCount * 1000) / elapsed);
  ui.fps.textContent = String(fps);
  state.frameCount = 0;
  state.lastFpsTs = ts;
}

function clearCanvases() {
  videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
}

function setStatus(value) {
  ui.status.textContent = value;
}

function setBackend(value) {
  ui.backend.textContent = value;
}

function setError(value) {
  ui.error.textContent = value;
  if (value && value !== "-") {
    ui.error.classList.add("error");
  } else {
    ui.error.classList.remove("error");
  }
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
