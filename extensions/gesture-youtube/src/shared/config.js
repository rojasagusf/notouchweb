export const CONFIG = {
  VIDEO_WIDTH: 960,
  VIDEO_HEIGHT: 540,

  OPEN_PALM_THRESHOLD: 0.78,
  SWIPE_RIGHT_THRESHOLD: 0.72,
  HOLD_MS: 180,
  COOLDOWN_MS: 1200,

  SWIPE_WINDOW_MS: 280,
  SWIPE_MIN_DELTA: 0.16,
  SWIPE_MAX_DRIFT_Y: 0.1,

  STATUS_INTERVAL_MS: 140,

  MODEL_URL_HAND_LANDMARKER:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  WASM_CDN_BASE: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
};
