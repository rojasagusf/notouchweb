const WASM_BASE = chrome.runtime.getURL('src/libs/mediapipe/wasm/');
const BUNDLE    = chrome.runtime.getURL('src/libs/mediapipe/vision_bundle.mjs');
const MODEL     = chrome.runtime.getURL('src/libs/mediapipe/hand_landmarker.task');

const SETTINGS = {
  holdMs:      160,
  cooldownMs: 1000,

  palmThreshold:  0.75,
  fistThreshold:  0.70,
  pointThreshold: 0.65,

  pointMinCos: 0.72,   // cos mínimo respecto al eje horizontal
  pointMinLen: 0.07,   // largo mínimo vector MCP→TIP
};

const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP:  5, INDEX_PIP:  6, INDEX_TIP:  8,
  MIDDLE_MCP: 9, MIDDLE_PIP:10, MIDDLE_TIP:12,
  RING_MCP:  13, RING_PIP:  14, RING_TIP:  16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_TIP: 20,
};

function dist2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp01(v)  { return Math.max(0, Math.min(1, v)); }

export class GestureEngine {
  constructor(videoEl, canvasEl, { onGesture, onScores, onFps, onStatus }) {
    this.video     = videoEl;
    this.canvas    = canvasEl;
    this.ctx       = canvasEl.getContext('2d', { willReadFrequently: true });
    this.onGesture = onGesture;
    this.onScores  = onScores;
    this.onFps     = onFps;
    this.onStatus  = onStatus;

    this.running         = false;
    this._rafId          = null;
    this._lastTs         = 0;
    this._frameCount     = 0;
    this._fpsTimer       = 0;
    this._handLandmarker = null;
    this._HandLandmarker = null;

    this._fsm = {
      palm:   this._newFSM(),
      fist:   this._newFSM(),
      swipeR: this._newFSM(),
      swipeL: this._newFSM(),
    };
  }

  _newFSM() {
    return { candidate: null, since: 0, peak: 0, cooldownUntil: 0 };
  }

  // ── Lifecycle ─────────────────────────────────────────────

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await new Promise((r) => { this.video.onloadedmetadata = r; });
    await this.video.play();
    this.canvas.width  = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;

    this.onStatus?.('Cargando modelo…');
    try {
      await this._loadModel();
      this.onStatus?.('Modelo listo');
    } catch (e) {
      this.onStatus?.('Error: ' + e.message);
      throw e;
    }

    this.running = true;
    this._rafId  = requestAnimationFrame((ts) => this._loop(ts));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._rafId);
    this.video.srcObject?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this._handLandmarker?.close();
    this._handLandmarker = null;
  }

  async _loadModel() {
    const { HandLandmarker, FilesetResolver } = await import(BUNDLE);
    this._HandLandmarker = HandLandmarker;

    let fileset;
    try   { fileset = await FilesetResolver.forVisionTasks(WASM_BASE); }
    catch { fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'); }

    const shared = {
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence:  0.6,
      minTrackingConfidence:      0.5,
    };
    try {
      this._handLandmarker = await HandLandmarker.createFromOptions(fileset,
        { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, ...shared });
    } catch {
      this._handLandmarker = await HandLandmarker.createFromOptions(fileset,
        { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, ...shared });
    }
  }

  // ── Loop ──────────────────────────────────────────────────

  _loop(ts) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame((t) => this._loop(t));

    const dt = ts - this._lastTs;
    this._lastTs = ts;
    this._frameCount++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 500) {
      this.onFps?.(Math.round(this._frameCount / (this._fpsTimer / 1000)));
      this._frameCount = 0;
      this._fpsTimer   = 0;
    }

    this.ctx.save();
    this.ctx.translate(this.canvas.width, 0);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();

    if (!this._handLandmarker || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    let result;
    try { result = this._handLandmarker.detectForVideo(this.video, ts); }
    catch { return; }

    this._process(result, ts);
  }

  // ── Procesamiento ─────────────────────────────────────────

  _process(result, ts) {
    const lm = result?.landmarks?.[0];

    if (!lm || lm.length < 21) {
      this.onScores?.({ palm: 0, fist: 0, swipeR: 0, swipeL: 0 });
      return;
    }

    this._drawSkeleton(lm);

    const scores = {
      palm:   this._scorePalm(lm),
      fist:   this._scoreFist(lm),
      swipeR: this._scorePointingDir(lm, 'right'),
      swipeL: this._scorePointingDir(lm, 'left'),
    };

    this.onScores?.(scores);

    this._tick(this._fsm.palm,   'OPEN_PALM',   scores.palm,   SETTINGS.palmThreshold,  ts);
    this._tick(this._fsm.fist,   'CLOSED_FIST', scores.fist,   SETTINGS.fistThreshold,  ts);
    this._tick(this._fsm.swipeR, 'SWIPE_RIGHT', scores.swipeR, SETTINGS.pointThreshold, ts);
    this._tick(this._fsm.swipeL, 'SWIPE_LEFT',  scores.swipeL, SETTINGS.pointThreshold, ts);
  }

  // ── FSM ───────────────────────────────────────────────────

  _tick(fsm, name, score, threshold, ts) {
    if (ts < fsm.cooldownUntil) return;

    if (score < threshold) {
      fsm.candidate = null; fsm.since = 0; fsm.peak = 0;
      return;
    }

    if (fsm.candidate !== name) {
      fsm.candidate = name; fsm.since = ts; fsm.peak = score;
      return;
    }

    fsm.peak = Math.max(fsm.peak, score);
    if (ts - fsm.since < SETTINGS.holdMs) return;

    fsm.cooldownUntil = ts + SETTINGS.cooldownMs;
    fsm.candidate = null; fsm.since = 0; fsm.peak = 0;
    this.onGesture?.(name, score);
  }

  // ── Scores ────────────────────────────────────────────────

  _scorePalm(lm) {
    const wrist = lm[LM.WRIST];
    const chains = [[8,6,5],[12,10,9],[16,14,13],[20,18,17]];
    let extended = 0;
    for (const [tip, pip, mcp] of chains) {
      const upright = lm[tip].y < lm[pip].y && lm[pip].y < lm[mcp].y;
      if (dist2(lm[tip], wrist) > dist2(lm[pip], wrist) * 1.12 && upright) extended++;
    }
    const tips  = [lm[8], lm[12], lm[16], lm[20]];
    const spread = this._avgPairDist(tips);
    return clamp01(clamp01((extended - 2) / 2) * 0.75 + clamp01((spread - 0.08) / 0.15) * 0.25);
  }

  _scoreFist(lm) {
    const wrist = lm[LM.WRIST];
    const chains = [[8,6],[12,10],[16,14],[20,18]];
    let curled = 0;
    for (const [tip, pip] of chains) {
      if (dist2(lm[tip], wrist) < dist2(lm[pip], wrist)) curled++;
    }
    const thumbIn = dist2(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) < 0.12;
    return clamp01((curled / 4) * 0.8 + (thumbIn ? 1 : 0) * 0.2);
  }

  _scorePointingDir(lm, dir) {
    const mcpX = 1 - lm[LM.INDEX_MCP].x;
    const mcpY =     lm[LM.INDEX_MCP].y;
    const tipX = 1 - lm[LM.INDEX_TIP].x;
    const tipY =     lm[LM.INDEX_TIP].y;

    const dx  = tipX - mcpX;
    const dy  = tipY - mcpY;
    const len = Math.hypot(dx, dy);

    if (len < SETTINGS.pointMinLen) return 0;

    const cosH = Math.abs(dx) / len;
    if (cosH < SETTINGS.pointMinCos) return 0;

    if (dir === 'right' && dx <= 0) return 0;
    if (dir === 'left'  && dx >= 0) return 0;

    const dirScore = clamp01((cosH - SETTINGS.pointMinCos) / (1 - SETTINGS.pointMinCos));
    const lenScore = clamp01((len  - SETTINGS.pointMinLen) / 0.12);
    return clamp01(dirScore * 0.7 + lenScore * 0.3);
  }

  _avgPairDist(pts) {
    let sum = 0, n = 0;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) { sum += dist2(pts[i], pts[j]); n++; }
    return n > 0 ? sum / n : 0;
  }

  // ── Dibujo ────────────────────────────────────────────────

  _drawSkeleton(lm) {
    const W = this.canvas.width, H = this.canvas.height;
    const ctx = this.ctx;

    for (const { start, end } of (this._HandLandmarker?.HAND_CONNECTIONS ?? [])) {
      ctx.beginPath();
      ctx.moveTo((1 - lm[start].x) * W, lm[start].y * H);
      ctx.lineTo((1 - lm[end].x)   * W, lm[end].y   * H);
      ctx.lineWidth   = 2;
      ctx.strokeStyle = 'rgba(56,189,248,0.85)';
      ctx.stroke();
    }

    for (let i = 0; i < lm.length; i++) {
      ctx.beginPath();
      ctx.arc((1 - lm[i].x) * W, lm[i].y * H, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(248,250,252,0.9)';
      ctx.fill();
    }

    // Flecha de dirección del índice
    const scoreR = this._scorePointingDir(lm, 'right');
    const scoreL = this._scorePointingDir(lm, 'left');
    const score  = Math.max(scoreR, scoreL);
    if (score > 0.2) {
      const tipX = (1 - lm[LM.INDEX_TIP].x) * W;
      const tipY =     lm[LM.INDEX_TIP].y    * H;
      const mcpX = (1 - lm[LM.INDEX_MCP].x) * W;
      const mcpY =     lm[LM.INDEX_MCP].y    * H;
      const alpha = Math.min(1, score * 1.4);
      ctx.lineWidth   = 3;
      ctx.strokeStyle = `rgba(0,212,170,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(mcpX, mcpY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      const angle = Math.atan2(tipY - mcpY, tipX - mcpX);
      const s = 10;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - s * Math.cos(angle - 0.4), tipY - s * Math.sin(angle - 0.4));
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - s * Math.cos(angle + 0.4), tipY - s * Math.sin(angle + 0.4));
      ctx.stroke();
    }
  }
}
