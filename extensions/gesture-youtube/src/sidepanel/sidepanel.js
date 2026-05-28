import { MSG } from '../shared/messages.js';
import { GESTURE_LABELS } from '../shared/gestures.js';

const btnToggle = document.getElementById('btn-toggle');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const fpsEl = document.getElementById('fps');

const runtimeSection = document.getElementById('runtime-section');
const backendEl = document.getElementById('backend');
const handEl = document.getElementById('hand');
const openPalmEl = document.getElementById('open-palm');
const swipeRightEl = document.getElementById('swipe-right');
const candidateEl = document.getElementById('candidate');
const cooldownEl = document.getElementById('cooldown');
const commandEl = document.getElementById('last-command');

const gestureEl = document.getElementById('last-gesture');
const errorReadoutEl = document.getElementById('error-readout');
const errorMessageEl = document.getElementById('error-message');

let enabled = false;
let lastGestureTimestampSeen = 0;

btnToggle.addEventListener('click', async () => {
  btnToggle.disabled = true;

  if (enabled) {
    await sendRuntimeMessage({ type: MSG.DISABLE }).catch((error) => {
      setStatus('error', `No se pudo desactivar: ${error.message}`);
    });
  } else {
    setStatus('loading', 'Iniciando runtime…');
    await sendRuntimeMessage({ type: MSG.ENABLE }).catch((error) => {
      setStatus('error', `No se pudo activar: ${error.message}`);
    });
  }

  btnToggle.disabled = false;
  await refreshStatus();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== MSG.STATUS_UPDATE) {
    return;
  }

  applyStatus(msg.payload);
});

void refreshStatus();

async function refreshStatus() {
  const payload = await sendRuntimeMessage({ type: MSG.GET_STATUS }).catch((error) => {
    setStatus('error', `Runtime desconectado: ${error.message}`);
    return null;
  });

  if (!payload) {
    return;
  }

  applyStatus(payload);
}

function applyStatus(status) {
  if (!status || typeof status !== 'object') {
    return;
  }

  enabled = Boolean(status.enabled);

  const detection = status.detection ?? {};
  const running = Boolean(detection.running);

  if (!enabled) {
    setStatus('idle', 'Inactivo');
  } else if (enabled && !running) {
    setStatus('loading', 'Inicializando detección…');
  } else if (enabled && running) {
    setStatus('active', 'Detectando gestos');
  }

  btnToggle.textContent = enabled ? 'Desactivar' : 'Activar gestos';
  btnToggle.classList.toggle('active', enabled);

  runtimeSection.classList.toggle('hidden', !enabled);

  fpsEl.textContent = `${Number(detection.fps ?? 0)} fps`;
  backendEl.textContent = detection.backend ?? '-';
  handEl.textContent = detection.handDetected ? 'yes' : 'no';
  openPalmEl.textContent = Number(detection.openPalmConfidence ?? 0).toFixed(2);
  swipeRightEl.textContent = Number(detection.swipeRightConfidence ?? 0).toFixed(2);
  candidateEl.textContent = detection.candidate ?? '-';

  const cooldownMs = Number(detection.cooldownRemainingMs ?? 0);
  cooldownEl.textContent = cooldownMs > 0 ? `${cooldownMs}ms` : 'ready';

  const gestureTimestamp = Number(status.lastGesture?.timestampMs ?? 0);
  if (status.lastGesture?.gesture) {
    const label = GESTURE_LABELS[status.lastGesture.gesture] ?? status.lastGesture.gesture;
    gestureEl.textContent = label;

    if (gestureTimestamp > lastGestureTimestampSeen) {
      lastGestureTimestampSeen = gestureTimestamp;
      gestureEl.classList.add('flash');
      setTimeout(() => gestureEl.classList.remove('flash'), 350);
    }
  } else {
    gestureEl.textContent = '—';
    lastGestureTimestampSeen = 0;
  }

  if (status.lastAction?.action) {
    const suffix = status.lastAction.ok === false ? ' (failed)' : '';
    commandEl.textContent = `${status.lastAction.action}${suffix}`;
  } else {
    commandEl.textContent = '-';
  }

  const error = detection.lastError;
  if (error) {
    errorMessageEl.textContent = error;
    errorReadoutEl.classList.remove('hidden');
  } else {
    errorMessageEl.textContent = '—';
    errorReadoutEl.classList.add('hidden');
  }
}

function setStatus(state, text) {
  statusDot.className = `dot ${state}`;
  statusText.textContent = text;
}

async function sendRuntimeMessage(message) {
  const response = await chrome.runtime.sendMessage(message);

  if (!response?.ok) {
    const messageText = response?.error ?? 'Unknown extension error';
    throw new Error(messageText);
  }

  return response.payload;
}
