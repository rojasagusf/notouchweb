Gesture YouTube Extension (Scaffold)
Chrome extension scaffold (Manifest V3) to control YouTube with hand gestures.

Current status
Implemented:

popup UI for enable/disable and settings
service worker orchestration and persisted state
offscreen camera runtime lifecycle
YouTube content adapter (play/pause, next)
Pending (next milestone):

TensorFlow.js hand landmarks
gesture classification + temporal filter
end-to-end gesture -> command pipeline
Structure
extensions/gesture-youtube/
  manifest.json
  src/
    background/sw.js
    content/youtube.js
    offscreen/offscreen.html
    offscreen/offscreen.js
    popup/popup.html
    popup/popup.css
    popup/popup.js
    shared/config.js
    shared/messages.js
Load unpacked in Chrome
Open chrome://extensions.
Enable Developer mode.
Click Load unpacked.
Select folder extensions/gesture-youtube.
Manual smoke test
Open a YouTube tab.
Click extension icon and press Activar.
Accept camera permission prompt.
Confirm popup shows Camara: encendida and FPS > 0.
Press Desactivar and confirm camera turns off.
Notes
Processing is local-only in the browser runtime.
This scaffold assumes Chrome 116+ for stable offscreen context checks.