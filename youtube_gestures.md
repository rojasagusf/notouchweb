YouTube Gesture Extension Backlog
Context
Build a Chrome MV3 extension that detects hand gestures locally and controls YouTube playback.

V1 actions:

play/pause
next
Principles:

local-first inference (no video upload)
explicit module boundaries
safe defaults against false positives
Scope V1
In scope:

Chrome desktop extension (Manifest V3)
Offscreen camera capture + gesture inference
Content script control for youtube.com
Popup controls (enable/disable + sensitivity)
Local settings persistence
Out of scope:

custom model training
support for non-YouTube sites
Firefox/Safari support
cloud processing
Architecture (target)
background/service worker: lifecycle + orchestration + message routing
offscreen document: camera, frame loop, gesture detection, temporal filtering
content script: YouTube player action adapter
popup: UX controls and status
shared: contracts, message types, config schema
Milestones
M0 - Repo Scaffold (0.5 day)
Goal: runnable extension skeleton with reliable message flow.

Tasks:

Create extension folder and file layout.
Add manifest.json with minimum permissions.
Implement service worker boot + command routing.
Implement popup -> service worker toggling.
Implement content script action adapter placeholders.
Add README with load/unpacked instructions.
Acceptance:

Extension loads in Chrome without errors.
Popup can toggle enabled/disabled state.
Service worker can ping content script on active YouTube tab.
M1 - Camera + Offscreen Runtime (1 day)
Goal: stable camera loop in offscreen document.

Tasks:

Create offscreen bootstrap and lifecycle helpers.
Request camera only when user enables detection.
Start/stop media stream cleanly.
Add basic telemetry (fps, camera state, errors).
Acceptance:

Camera prompt appears only when enabling detection.
Stop disables camera stream and releases tracks.
Background receives periodic heartbeat from offscreen.
M2 - Gesture Detection Core (1-2 days)
Goal: produce reliable gesture events from landmarks.

Tasks:

Integrate TensorFlow.js hand pose detector.
Normalize landmarks and compute geometric features.
Implement rule-based classifiers (open_palm, swipe_right).
Add confidence scoring per frame.
Acceptance:

Detector runs at target FPS (>= 15 on modern laptop).
Each frame emits stable confidence for known gestures.
M3 - Temporal Filter + Action Bus (1 day)
Goal: avoid accidental triggers and emit intentional commands.

Tasks:

Add finite-state machine (IDLE, CANDIDATE, CONFIRMED, COOLDOWN).
Implement debounce/hold/cooldown parameters.
Emit canonical commands (TOGGLE_PLAYBACK, NEXT_TRACK).
Acceptance:

Single gesture does not double-fire.
Random motion under threshold does not trigger actions.
M4 - YouTube Controls (1 day)
Goal: robust action execution in YouTube player.

Tasks:

Implement play/pause via HTMLVideoElement.
Implement next via player next button adapter.
Handle unavailable states (no next item, ads, inactive tab).
Return structured action result to background.
Acceptance:

open_palm toggles playback reliably.
swipe_right advances when next is available.
Failures are visible in extension status.
M5 - UX + Calibration (1 day)
Goal: user can tune behavior without code edits.

Tasks:

Add popup sensitivity presets.
Add cooldown and hold controls.
Add status badges and last action timestamp.
Persist settings in chrome.storage.local.
Acceptance:

Settings survive browser restart.
User can reduce false positives by adjusting controls.
M6 - Hardening + QA (1 day)
Goal: ready for private dogfood.

Tasks:

Add error boundaries and retry policies.
Add structured logs and debug mode toggle.
Manual QA matrix (lighting, camera angle, tab focus).
Packaging checklist for Chrome Web Store constraints.
Acceptance:

Extension remains stable through enable/disable cycles.
Known failure cases degrade gracefully with clear messages.
Task Board (ordered)
EXT-001 Setup folder layout + manifest + README
EXT-002 Shared message contracts and config defaults
EXT-003 Service worker state machine (enable/disable/session)
EXT-004 Popup controls + live status binding
EXT-005 Offscreen lifecycle + media stream management
EXT-006 TF.js hand detector integration
EXT-007 Gesture feature extraction + classifiers
EXT-008 Temporal FSM + cooldown/debounce
EXT-009 YouTube content adapter (play/pause + next)
EXT-010 End-to-end command pipeline and telemetry
EXT-011 Calibration UI and settings persistence
EXT-012 QA runbook + release checklist
Initial Technical Decisions
Keep all gesture inference local in offscreen document.
Keep content script focused on YouTube action execution only.
Use command events instead of direct cross-module function calls.
Prefer deterministic rule-based gesture classification for V1 over model fine-tuning.
Start with 2 gestures; scale only after false-positive rate is acceptable.
Risks and Mitigation
False positives in noisy backgrounds.
Mitigation: temporal filter + higher default confidence + cooldown.
YouTube DOM changes can break selectors.
Mitigation: adapter layer with fallback strategies and telemetry.
Camera permission friction.
Mitigation: clear popup copy and explicit enable/disable flow.
Performance regressions on low-power devices.
Mitigation: configurable FPS target + optional lower resolution.
Definition of Done (V1)
User installs extension and enables gesture mode.
Camera starts, gestures are recognized, actions execute on YouTube.
No network transfer of camera frames.
Core settings are persisted.
Known edge cases are documented with expected behavior.