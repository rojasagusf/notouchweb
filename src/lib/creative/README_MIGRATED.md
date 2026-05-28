# Migrated Creative Modules (from juan.software)

These modules were copied to speed up hackathon integration for:
- webcam lifecycle
- body/person segmentation
- frame debug processing
- motion estimation helpers

## Files included

- `camera/webcam.ts`, `camera/types.ts`
- `segmentation/personSegmentation.ts`, `segmentation/refineMask.ts`, `segmentation/types.ts`
- `processing/frameProcessing.ts`
- `adapters/videoMotion.ts`, `adapters/personMaskToTargets.ts`
- `core/canvas.ts`, `core/frameClock.ts`, `core/quality.ts`
- `math.ts`

## MediaPipe runtime assets

Local runtime files copied to:
- `vendor/mediapipe/tasks-vision/vision_bundle.mjs`
- `vendor/mediapipe/tasks-vision/wasm/*`

`personSegmentation.ts` now tries:
1. `@mediapipe/tasks-vision` (if installed)
2. local vendor module (`vendor/mediapipe/tasks-vision/vision_bundle.mjs`)

WASM loading defaults to local vendor path, with CDN fallback.

## Model asset

Default model path is remote:
- `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`

For offline/demo stability, set `modelAssetPath` to a local `.tflite` file you host in your extension/app.
