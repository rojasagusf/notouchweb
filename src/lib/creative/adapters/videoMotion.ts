import { clamp, damp } from "../math";

export type VideoMotionEstimator = {
  sample: (video: HTMLVideoElement, mirrorX: boolean) => number;
};

type CreateVideoMotionEstimatorPayload = {
  width: number;
  height: number;
};

export const createVideoMotionEstimator = (
  payload: CreateVideoMotionEstimatorPayload,
): VideoMotionEstimator => {
  const offscreen = document.createElement("canvas");
  offscreen.width = payload.width;
  offscreen.height = payload.height;

  const context = offscreen.getContext("2d", {
    willReadFrequently: true,
  });

  let previousFrame: Uint8ClampedArray | null = null;
  let smoothedEnergy = 0;

  return {
    sample: (video, mirrorX) => {
      if (!context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return smoothedEnergy;
      }

      context.save();
      context.clearRect(0, 0, offscreen.width, offscreen.height);

      if (mirrorX) {
        context.translate(offscreen.width, 0);
        context.scale(-1, 1);
      }

      context.drawImage(video, 0, 0, offscreen.width, offscreen.height);
      context.restore();

      const frame = context.getImageData(0, 0, offscreen.width, offscreen.height).data;

      if (!previousFrame) {
        previousFrame = new Uint8ClampedArray(frame);
        return smoothedEnergy;
      }

      let difference = 0;
      const sampleStep = 4 * 8;

      for (let index = 0; index < frame.length; index += sampleStep) {
        const currentLuma = frame[index] * 0.2126 + frame[index + 1] * 0.7152 + frame[index + 2] * 0.0722;
        const previousLuma =
          previousFrame[index] * 0.2126 +
          previousFrame[index + 1] * 0.7152 +
          previousFrame[index + 2] * 0.0722;

        difference += Math.abs(currentLuma - previousLuma);
      }

      previousFrame.set(frame);

      const normalized = clamp(difference / ((frame.length / sampleStep) * 62), 0, 1);
      smoothedEnergy = damp(smoothedEnergy, normalized, 10, 1 / 60);

      return smoothedEnergy;
    },
  };
};
