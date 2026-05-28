import { computeCoverSourceRect } from "../core/canvas";
import { clamp } from "../math";

export type FrameProcessingSnapshot = {
  width: number;
  height: number;
  timestampMs: number;
  processingMs: number;
  luminanceMean: number;
  motionMean: number;
  motionPeak: number;
  sourceCanvas: HTMLCanvasElement;
  luminanceCanvas: HTMLCanvasElement;
  motionCanvas: HTMLCanvasElement;
};

export type FrameProcessor = {
  process: (video: HTMLVideoElement, timestampMs: number, mirrorX: boolean) => FrameProcessingSnapshot | null;
};

type CreateFrameProcessorPayload = {
  width: number;
  height: number;
};

const createCanvas2D = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
    alpha: false,
  });

  return {
    canvas,
    context,
  };
};

export const createFrameProcessor = (payload: CreateFrameProcessorPayload): FrameProcessor => {
  const width = Math.max(8, Math.floor(payload.width));
  const height = Math.max(8, Math.floor(payload.height));

  const source = createCanvas2D(width, height);
  const luminance = createCanvas2D(width, height);
  const motion = createCanvas2D(width, height);

  const previousLuminance = new Float32Array(width * height);
  let hasPrevious = false;

  return {
    process: (video, timestampMs, mirrorX) => {
      if (!source.context || !luminance.context || !motion.context) {
        return null;
      }

      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        return null;
      }

      const processStart = performance.now();
      const cover = computeCoverSourceRect(video.videoWidth, video.videoHeight, width, height);

      source.context.save();
      source.context.clearRect(0, 0, width, height);
      source.context.imageSmoothingEnabled = true;

      if (mirrorX) {
        source.context.translate(width, 0);
        source.context.scale(-1, 1);
      }

      source.context.drawImage(
        video,
        cover.sx,
        cover.sy,
        cover.sWidth,
        cover.sHeight,
        0,
        0,
        width,
        height,
      );
      source.context.restore();

      const frameData = source.context.getImageData(0, 0, width, height);
      const luminanceData = luminance.context.createImageData(width, height);
      const motionData = motion.context.createImageData(width, height);

      let luminanceAccum = 0;
      let motionAccum = 0;
      let motionPeak = 0;

      for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
        const rgbaIndex = pixelIndex * 4;
        const r = frameData.data[rgbaIndex] ?? 0;
        const g = frameData.data[rgbaIndex + 1] ?? 0;
        const b = frameData.data[rgbaIndex + 2] ?? 0;

        const luma = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        const previous = hasPrevious ? previousLuminance[pixelIndex] ?? luma : luma;
        const motionDelta = Math.abs(luma - previous);

        previousLuminance[pixelIndex] = luma;

        const lumaByte = Math.round(clamp(luma, 0, 1) * 255);
        const motionNormalized = clamp(motionDelta * 5.4, 0, 1);
        const motionByte = Math.round(motionNormalized * 255);

        luminanceData.data[rgbaIndex] = lumaByte;
        luminanceData.data[rgbaIndex + 1] = lumaByte;
        luminanceData.data[rgbaIndex + 2] = lumaByte;
        luminanceData.data[rgbaIndex + 3] = 255;

        motionData.data[rgbaIndex] = motionByte;
        motionData.data[rgbaIndex + 1] = motionByte;
        motionData.data[rgbaIndex + 2] = motionByte;
        motionData.data[rgbaIndex + 3] = 255;

        luminanceAccum += luma;
        motionAccum += motionNormalized;
        motionPeak = Math.max(motionPeak, motionNormalized);
      }

      hasPrevious = true;
      luminance.context.putImageData(luminanceData, 0, 0);
      motion.context.putImageData(motionData, 0, 0);

      const processingMs = performance.now() - processStart;
      const pixelCount = width * height;

      return {
        width,
        height,
        timestampMs,
        processingMs,
        luminanceMean: luminanceAccum / Math.max(1, pixelCount),
        motionMean: motionAccum / Math.max(1, pixelCount),
        motionPeak,
        sourceCanvas: source.canvas,
        luminanceCanvas: luminance.canvas,
        motionCanvas: motion.canvas,
      };
    },
  };
};
