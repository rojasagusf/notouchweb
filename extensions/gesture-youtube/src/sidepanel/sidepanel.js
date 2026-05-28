import { GestureEngine } from './gesture-engine.js';
import { MSG } from '../shared/messages.js';
import { GESTURE_LABELS } from '../shared/gestures.js';

const video  = document.getElementById('camera-feed');
const canvas = document.getElementById('camera-canvas');
const btnToggle    = document.getElementById('btn-toggle');
const statusDot    = document.getElementById('status-dot');
const statusText   = document.getElementById('status-text');
const fpsEl        = document.getElementById('fps');
const gestureEl    = document.getElementById('last-gesture');
const cameraSection = document.getElementById('camera-section');

let engine  = null;
let enabled = false;

async function enable() {
  setStatus('loading', 'Iniciando cámara…');
  btnToggle.disabled = true;

  engine = new GestureEngine(video, canvas, {
    onGesture:    handleGesture,
    onFps:        (fps) => { fpsEl.textContent = `${fps} fps`; },
    onCursorMove: sendCursorMove,
  });

  try {
    await engine.start();
  } catch (e) {
    setStatus('error', 'Error de cámara: ' + e.message);
    btnToggle.disabled = false;
    engine = null;
    return;
  }

  enabled = true;
  cameraSection.classList.remove('hidden');
  setStatus('active', 'Detectando gestos');
  btnToggle.textContent = 'Desactivar';
  btnToggle.classList.add('active');
  btnToggle.disabled = false;

  await chrome.runtime.sendMessage({ type: MSG.ENABLE });
}

async function disable() {
  engine?.stop();
  engine = null;
  enabled = false;

  cameraSection.classList.add('hidden');
  setStatus('idle', 'Inactivo');
  btnToggle.textContent = 'Activar gestos';
  btnToggle.classList.remove('active');
  fpsEl.textContent = '— fps';
  gestureEl.textContent = '—';

  await chrome.runtime.sendMessage({ type: MSG.DISABLE });
}

function handleGesture(gesture) {
  const label = GESTURE_LABELS[gesture] ?? gesture;
  gestureEl.textContent = label;
  gestureEl.classList.add('flash');
  setTimeout(() => gestureEl.classList.remove('flash'), 400);

  chrome.runtime.sendMessage({ type: MSG.GESTURE_DETECTED, gesture });
}

async function sendCursorMove(x, y) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, {
    type: MSG.EXECUTE_ACTION,
    action: 'MOVE_CURSOR',
    payload: { x, y },
  }).catch(() => {});
}

function setStatus(state, text) {
  statusDot.className = `dot ${state}`;
  statusText.textContent = text;
}

btnToggle.addEventListener('click', () => {
  enabled ? disable() : enable();
});

// Sync state on open
chrome.runtime.sendMessage({ type: MSG.GET_STATUS }, (res) => {
  if (res?.enabled) enable();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.STATUS_UPDATE && !msg.enabled && enabled) disable();
});
