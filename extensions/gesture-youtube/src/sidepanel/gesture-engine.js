import { CONFIG } from '../shared/config.js';

export class GestureEngine {
  constructor(videoEl, canvasEl, { onGesture, onFps, onCursorMove }) {
    this.video   = videoEl;
    this.canvas  = canvasEl;
    this.ctx     = canvasEl.getContext('2d', { willReadFrequently: true });
    this.onGesture    = onGesture;
    this.onFps        = onFps;
    this.onCursorMove = onCursorMove;

    this.running       = false;
    this._rafId        = null;
    this._lastTs       = 0;
    this._lastGestureTs = 0;
    this._prevCentroid  = null;
    this._smoothCursor  = null;
    this._frameCount    = 0;
    this._fpsTimer      = 0;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width:  CONFIG.VIDEO_WIDTH,
        height: CONFIG.VIDEO_HEIGHT,
        facingMode: 'user',
      },
      audio: false,
    });

    this.video.srcObject = stream;
    await new Promise((res) => { this.video.onloadedmetadata = res; });
    await this.video.play();

    this.canvas.width  = CONFIG.VIDEO_WIDTH;
    this.canvas.height = CONFIG.VIDEO_HEIGHT;

    this.running = true;
    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
    return true;
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.video.srcObject?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }

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

    // Mirror image so it feels natural
    this.ctx.save();
    this.ctx.translate(CONFIG.VIDEO_WIDTH, 0);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.video, 0, 0, CONFIG.VIDEO_WIDTH, CONFIG.VIDEO_HEIGHT);
    this.ctx.restore();

    this._processFrame(ts);
  }

  _processFrame(ts) {
    const W = CONFIG.VIDEO_WIDTH;
    const H = CONFIG.VIDEO_HEIGHT;

    const imageData = this.ctx.getImageData(0, 0, W, H);
    const data = imageData.data;

    const STEP = 3; // sample every 3 pixels for perf
    let sumX = 0, sumY = 0, count = 0;

    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const i = (y * W + x) * 4;
        if (this._isSkin(data[i], data[i + 1], data[i + 2])) {
          sumX += x;
          sumY += y;
          count++;
          data[i]     = 0;
          data[i + 1] = 220;
          data[i + 2] = 120;
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0);

    if (count < CONFIG.SKIN_MIN_PIXEL_COUNT) {
      this._prevCentroid = null;
      return;
    }

    const cx = sumX / count;
    const cy = sumY / count;

    // Draw centroid
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    this.ctx.fillStyle = '#00d4aa';
    this.ctx.fill();

    // Smooth cursor position relative to viewport
    const normX = cx / W;
    const normY = cy / H;
    const viewW = window.screen.width;
    const viewH = window.screen.height;
    const targetX = normX * viewW;
    const targetY = normY * viewH;

    if (!this._smoothCursor) {
      this._smoothCursor = { x: targetX, y: targetY };
    } else {
      const s = CONFIG.CURSOR_SMOOTHING;
      this._smoothCursor.x += (targetX - this._smoothCursor.x) * s;
      this._smoothCursor.y += (targetY - this._smoothCursor.y) * s;
    }

    this.onCursorMove?.(this._smoothCursor.x, this._smoothCursor.y);

    if (!this._prevCentroid) {
      this._prevCentroid = { x: cx, y: cy };
      return;
    }

    const now = ts;
    if (now - this._lastGestureTs < CONFIG.GESTURE_DEBOUNCE_MS) {
      this._prevCentroid = { x: cx, y: cy };
      return;
    }

    const dx = cx - this._prevCentroid.x;
    const dy = cy - this._prevCentroid.y;
    const T  = CONFIG.SWIPE_THRESHOLD_PX;

    if (Math.abs(dx) > T || Math.abs(dy) > T) {
      const gesture = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT')
        : (dy > 0 ? 'SWIPE_DOWN'  : 'SWIPE_UP');

      this._lastGestureTs = now;
      this.onGesture?.(gesture);
    }

    this._prevCentroid = { x: cx, y: cy };
  }

  // YCbCr-based skin tone detection — works across a wide range of skin tones
  _isSkin(r, g, b) {
    if (r < 45 || g < 40 || b < 20) return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 15) return false;

    // Convert to YCbCr
    const Y  =  0.299  * r + 0.587  * g + 0.114  * b;
    const Cb = -0.1687 * r - 0.3313 * g + 0.5    * b + 128;
    const Cr =  0.5    * r - 0.4187 * g - 0.0813 * b + 128;

    return Y > 80 && Cb >= 77 && Cb <= 127 && Cr >= 133 && Cr <= 173;
  }
}
