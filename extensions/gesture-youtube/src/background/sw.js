import { MSG } from '../shared/messages.js';
import { GESTURE_ACTION_MAP } from '../shared/gestures.js';

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';

const state = {
  enabled: false,
  offscreenReady: false,
  detection: {
    running: false,
    cameraActive: false,
    backend: '-',
    fps: 0,
    handDetected: false,
    openPalmConfidence: 0,
    swipeRightConfidence: 0,
    candidate: null,
    cooldownRemainingMs: 0,
    lastError: null
  },
  lastGesture: null,
  lastAction: null
};

let creatingOffscreenPromise = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void broadcastStatus();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.windowId) {
    return;
  }

  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  void onMessage(msg, sender)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      state.detection.lastError = message;
      void broadcastStatus();
      sendResponse({ ok: false, error: message, payload: buildStatus() });
    });

  return true;
});

async function onMessage(msg, sender) {
  if (!msg || typeof msg.type !== 'string') {
    return buildStatus();
  }

  switch (msg.type) {
    case MSG.GET_STATUS:
      return buildStatus();

    case MSG.ENABLE:
      await setEnabled(true);
      return buildStatus();

    case MSG.DISABLE:
      await setEnabled(false);
      return buildStatus();

    case MSG.OFFSCREEN_READY:
      state.offscreenReady = true;
      state.detection.lastError = null;
      await broadcastStatus();
      return buildStatus();

    case MSG.OFFSCREEN_STATUS:
      state.detection = {
        ...state.detection,
        ...(msg.payload ?? {})
      };
      await broadcastStatus();
      return buildStatus();

    case MSG.OFFSCREEN_ERROR:
      state.detection.lastError = msg.payload?.message ?? 'Unknown offscreen error';
      await broadcastStatus();
      return buildStatus();

    case MSG.GESTURE_DETECTED:
      if (!state.enabled) {
        return buildStatus();
      }

      await handleGesture(msg.gesture, msg.payload ?? {}, sender);
      return buildStatus();

    default:
      return buildStatus();
  }
}

async function setEnabled(nextEnabled) {
  if (state.enabled === nextEnabled) {
    if (nextEnabled) {
      await ensureOffscreenDocument();
      await sendToOffscreen({ type: MSG.OFFSCREEN_START });
    }
    await broadcastStatus();
    return;
  }

  state.enabled = nextEnabled;

  if (nextEnabled) {
    await ensureOffscreenDocument();
    await sendToOffscreen({ type: MSG.OFFSCREEN_START });
  } else {
    await sendToOffscreen({ type: MSG.OFFSCREEN_STOP });
    await closeOffscreenDocument();

    state.offscreenReady = false;
    state.detection = {
      ...state.detection,
      running: false,
      cameraActive: false,
      fps: 0,
      handDetected: false,
      openPalmConfidence: 0,
      swipeRightConfidence: 0,
      candidate: null,
      cooldownRemainingMs: 0
    };

    state.lastGesture = null;
    state.lastAction = null;

    await hideCursorOnActiveTab();
  }

  await broadcastStatus();
}

async function handleGesture(gesture, payload, sender) {
  const action = GESTURE_ACTION_MAP[gesture];

  state.lastGesture = {
    gesture,
    confidence: Number(payload?.confidence ?? 0),
    timestampMs: Number(payload?.timestampMs ?? Date.now()),
    source: sender?.url ?? 'offscreen'
  };

  if (!action) {
    await broadcastStatus();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    state.lastAction = {
      action,
      ok: false,
      code: 'NO_ACTIVE_TAB',
      at: new Date().toISOString()
    };
    await broadcastStatus();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MSG.EXECUTE_ACTION,
      action,
      payload
    });

    state.lastAction = {
      action,
      ok: response?.ok ?? true,
      response: response ?? null,
      at: new Date().toISOString()
    };
  } catch (error) {
    state.lastAction = {
      action,
      ok: false,
      code: 'ACTION_SEND_FAILED',
      message: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString()
    };
  }

  await broadcastStatus();
}

async function hideCursorOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  await chrome.tabs.sendMessage(tab.id, {
    type: MSG.EXECUTE_ACTION,
    action: 'HIDE_CURSOR'
  }).catch(() => {});
}

function buildStatus() {
  return {
    enabled: state.enabled,
    offscreenReady: state.offscreenReady,
    detection: state.detection,
    lastGesture: state.lastGesture,
    lastAction: state.lastAction
  };
}

async function broadcastStatus() {
  await chrome.runtime.sendMessage({
    type: MSG.STATUS_UPDATE,
    payload: buildStatus()
  }).catch(() => {});
}

async function sendToOffscreen(message) {
  await chrome.runtime.sendMessage(message).catch((error) => {
    if (message.type === MSG.OFFSCREEN_STOP) {
      return;
    }

    throw error;
  });
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Need camera access to detect hand gestures in background runtime'
  });

  try {
    await creatingOffscreenPromise;
  } finally {
    creatingOffscreenPromise = null;
  }
}

async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) {
    return;
  }

  await chrome.offscreen.closeDocument();
}

async function hasOffscreenDocument() {
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });

    return contexts.length > 0;
  }

  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url.includes(OFFSCREEN_DOCUMENT_PATH));
}
