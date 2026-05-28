import { GestureEngine } from './gesture-engine.js';
import { MSG } from '../shared/messages.js';
import { GESTURE_LABELS, GESTURE_ACTION_MAP } from '../shared/gestures.js';

const video  = document.getElementById('camera-feed');
const canvas = document.getElementById('camera-canvas');
const btnToggle     = document.getElementById('btn-toggle');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const fpsEl         = document.getElementById('fps');
const cameraSection = document.getElementById('camera-section');
const logEl         = document.getElementById('event-log');

const scoresBars = {
  palm:   { bar: document.getElementById('bar-palm'),   val: document.getElementById('val-palm'),   threshold: 75 },
  fist:   { bar: document.getElementById('bar-fist'),   val: document.getElementById('val-fist'),   threshold: 70 },
  swipeR: { bar: document.getElementById('bar-swiper'), val: document.getElementById('val-swiper'), threshold: 65 },
  swipeL: { bar: document.getElementById('bar-swipel'), val: document.getElementById('val-swipel'), threshold: 65 },
};
const cards = {
  OPEN_PALM:   document.getElementById('card-palm'),
  CLOSED_FIST: document.getElementById('card-fist'),
  SWIPE_RIGHT: document.getElementById('card-swiper'),
  SWIPE_LEFT:  document.getElementById('card-swipel'),
};

let engine  = null;
let enabled = false;

async function enable() {
  setStatus('loading', 'Iniciando cámara…');
  btnToggle.disabled = true;

  engine = new GestureEngine(video, canvas, {
    onGesture: handleGesture,
    onScores:  handleScores,
    onFps:     (fps) => { fpsEl.textContent = `${fps} fps`; },
    onStatus:  (msg) => setStatus('loading', msg),
  });

  try {
    await engine.start();
  } catch (e) {
    engine = null;
    btnToggle.disabled = false;
    if (e.name === 'NotAllowedError') {
      setStatus('error', 'Permiso de cámara denegado');
      requestCameraViaPopup();
    } else {
      setStatus('error', e.message);
    }
    return;
  }

  enabled = true;
  cameraSection.classList.remove('hidden');
  setStatus('active', 'Detectando gestos');
  btnToggle.textContent = 'Detener';
  btnToggle.classList.add('active');
  btnToggle.disabled = false;
}

function disable() {
  engine?.stop();
  engine  = null;
  enabled = false;
  cameraSection.classList.add('hidden');
  setStatus('idle', 'Inactivo');
  btnToggle.textContent = 'Iniciar';
  btnToggle.classList.remove('active');
  fpsEl.textContent = '— fps';
  resetBars();
}

function handleScores(scores) {
  for (const [key, val] of Object.entries(scores)) {
    const { bar, val: valEl, threshold } = scoresBars[key];
    const pct = Math.round(val * 100);
    bar.style.width = pct + '%';
    valEl.textContent = pct + '%';
    bar.className = 'bar-fill' + (pct >= threshold ? ' active' : '');
  }
}

function handleGesture(name, confidence) {
  cards[name]?.classList.add('fired');
  setTimeout(() => cards[name]?.classList.remove('fired'), 600);

  const label = GESTURE_LABELS[name] ?? name;
  const time  = new Date().toLocaleTimeString('es', { hour12: false });
  const line  = document.createElement('div');
  line.className   = 'log-line';
  line.textContent = `${time}  ${label}  (${Math.round(confidence * 100)}%)`;
  logEl.prepend(line);
  if (logEl.children.length > 12) logEl.lastChild.remove();

  // Enviar acción directo al tab activo — evita depender del SW que puede estar dormido
  const action = GESTURE_ACTION_MAP[name];
  if (action) sendActionToActiveTab(action);
}

async function sendActionToActiveTab(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: MSG.EXECUTE_ACTION, action }).catch(() => {});
}

function resetBars() {
  for (const { bar, val } of Object.values(scoresBars)) {
    bar.style.width = '0%';
    val.textContent = '0%';
    bar.className   = 'bar-fill';
  }
}

function setStatus(state, text) {
  statusDot.className    = `dot ${state}`;
  statusText.textContent = text;
}

function requestCameraViaPopup() {
  chrome.windows.create({
    url: chrome.runtime.getURL('src/grant/grant.html'),
    type: 'popup', width: 380, height: 260, focused: true,
  });
  setStatus('loading', 'Esperando permiso de cámara…');
  btnToggle.disabled = true;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CAMERA_PERMISSION_GRANTED') {
    setStatus('loading', 'Permiso concedido…');
    setTimeout(enable, 400);
  }
});

btnToggle.addEventListener('click', () => {
  enabled ? disable() : enable();
});
