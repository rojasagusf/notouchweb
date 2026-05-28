import { MSG, ACTIONS } from '../shared/messages.js';
import { GESTURE_ACTION_MAP } from '../shared/gestures.js';

const state = { enabled: false };

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === MSG.GET_STATUS) {
    sendResponse({ enabled: state.enabled });
    return;
  }

  if (msg.type === MSG.ENABLE) {
    state.enabled = true;
    broadcastStatus();
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === MSG.DISABLE) {
    state.enabled = false;
    broadcastStatus();
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === MSG.GESTURE_DETECTED && state.enabled) {
    handleGesture(msg.gesture, msg.payload);
  }
});

async function handleGesture(gesture, payload) {
  const action = GESTURE_ACTION_MAP[gesture];
  if (!action) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: MSG.EXECUTE_ACTION,
      action,
      payload: payload ?? {},
    });
  } catch {
    // Tab might not have content script (e.g. chrome:// pages)
  }
}

function broadcastStatus() {
  chrome.runtime.sendMessage({ type: MSG.STATUS_UPDATE, enabled: state.enabled }).catch(() => {});
}
