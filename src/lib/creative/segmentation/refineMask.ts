import { clamp } from "../math";
import type { PersonSegmentationMask } from "./types";

export type RefinedSegmentationMetrics = {
  postProcessMs: number;
  foregroundRatio: number;
  noiseRatio: number;
  stabilityDelta: number;
};

export type RefinedSegmentationSnapshot = {
  width: number;
  height: number;
  rawCanvas: HTMLCanvasElement;
  smoothCanvas: HTMLCanvasElement;
  binaryCanvas: HTMLCanvasElement;
  metrics: RefinedSegmentationMetrics;
  smoothData: Float32Array;
  binaryMask: Uint8Array;
};

export type SegmentationRefiner = {
  refine: (mask: PersonSegmentationMask) => RefinedSegmentationSnapshot;
};

type CreateSegmentationRefinerPayload = {
  riseAlpha?: number;
  fallAlpha?: number;
  softThresholdOn?: number;
  softThresholdOff?: number;
};

const createCanvas = (width: number, height: number) => {
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

const countNeighbors = (mask: Uint8Array, width: number, height: number, x: number, y: number) => {
  let count = 0;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const ny = y + offsetY;
    if (ny < 0 || ny >= height) {
      continue;
    }

    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const nx = x + offsetX;
      if (nx < 0 || nx >= width) {
        continue;
      }

      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      if (mask[ny * width + nx] === 1) {
        count += 1;
      }
    }
  }

  return count;
};

export const createSegmentationRefiner = (
  payload: CreateSegmentationRefinerPayload = {},
): SegmentationRefiner => {
  const riseAlpha = payload.riseAlpha ?? 0.42;
  const fallAlpha = payload.fallAlpha ?? 0.2;
  const thresholdOn = payload.softThresholdOn ?? 0.58;
  const thresholdOff = payload.softThresholdOff ?? 0.42;

  let width = 0;
  let height = 0;
  let smoothed: Float32Array = new Float32Array(0);
  let spatial: Float32Array = new Float32Array(0);
  let previousSmoothed: Float32Array = new Float32Array(0);
  let binaryMask: Uint8Array = new Uint8Array(0);

  let rawCanvasBundle = createCanvas(2, 2);
  let smoothCanvasBundle = createCanvas(2, 2);
  let binaryCanvasBundle = createCanvas(2, 2);

  const ensureSize = (nextWidth: number, nextHeight: number) => {
    if (nextWidth === width && nextHeight === height) {
      return;
    }

    width = nextWidth;
    height = nextHeight;

    smoothed = new Float32Array(width * height);
    spatial = new Float32Array(width * height);
    previousSmoothed = new Float32Array(width * height);
    binaryMask = new Uint8Array(width * height);

    rawCanvasBundle = createCanvas(width, height);
    smoothCanvasBundle = createCanvas(width, height);
    binaryCanvasBundle = createCanvas(width, height);
  };

  return {
    refine: (mask) => {
      const postStart = performance.now();
      ensureSize(mask.width, mask.height);

      const pixelCount = width * height;
      let stabilityAccum = 0;

      for (let index = 0; index < pixelCount; index += 1) {
        previousSmoothed[index] = smoothed[index] ?? 0;

        const raw = clamp(mask.data[index] ?? 0, 0, 1);
        const previous = previousSmoothed[index] ?? raw;
        const alpha = raw >= previous ? riseAlpha : fallAlpha;
        const next = previous + (raw - previous) * alpha;
        smoothed[index] = next;
        stabilityAccum += Math.abs(next - previous);
      }

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;

          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
            spatial[index] = smoothed[index] ?? 0;
            continue;
          }

          let accum = 0;
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              accum += smoothed[(y + offsetY) * width + (x + offsetX)] ?? 0;
            }
          }

          spatial[index] = accum / 9;
        }
      }

      let foregroundBeforeCleanup = 0;

      for (let index = 0; index < pixelCount; index += 1) {
        const previousBinary = binaryMask[index] === 1;
        const value = spatial[index] ?? 0;
        const keep = previousBinary ? value >= thresholdOff : value >= thresholdOn;
        binaryMask[index] = keep ? 1 : 0;

        if (binaryMask[index] === 1) {
          foregroundBeforeCleanup += 1;
        }
      }

      let removedNoise = 0;

      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = y * width + x;
          if (binaryMask[index] === 0) {
            continue;
          }

          const neighbors = countNeighbors(binaryMask, width, height, x, y);
          if (neighbors <= 1) {
            binaryMask[index] = 0;
            removedNoise += 1;
          }
        }
      }

      const rawContext = rawCanvasBundle.context;
      const smoothContext = smoothCanvasBundle.context;
      const binaryContext = binaryCanvasBundle.context;

      if (rawContext && smoothContext && binaryContext) {
        const rawImage = rawContext.createImageData(width, height);
        const smoothImage = smoothContext.createImageData(width, height);
        const binaryImage = binaryContext.createImageData(width, height);

        for (let index = 0; index < pixelCount; index += 1) {
          const rgbaIndex = index * 4;
          const rawByte = Math.round(clamp(mask.data[index] ?? 0, 0, 1) * 255);
          const smoothByte = Math.round(clamp(spatial[index] ?? 0, 0, 1) * 255);
          const binaryByte = binaryMask[index] === 1 ? 255 : 0;

          rawImage.data[rgbaIndex] = rawByte;
          rawImage.data[rgbaIndex + 1] = rawByte;
          rawImage.data[rgbaIndex + 2] = rawByte;
          rawImage.data[rgbaIndex + 3] = 255;

          smoothImage.data[rgbaIndex] = smoothByte;
          smoothImage.data[rgbaIndex + 1] = smoothByte;
          smoothImage.data[rgbaIndex + 2] = smoothByte;
          smoothImage.data[rgbaIndex + 3] = 255;

          binaryImage.data[rgbaIndex] = binaryByte;
          binaryImage.data[rgbaIndex + 1] = binaryByte;
          binaryImage.data[rgbaIndex + 2] = binaryByte;
          binaryImage.data[rgbaIndex + 3] = 255;
        }

        rawContext.putImageData(rawImage, 0, 0);
        smoothContext.putImageData(smoothImage, 0, 0);
        binaryContext.putImageData(binaryImage, 0, 0);
      }

      const foregroundAfterCleanup = foregroundBeforeCleanup - removedNoise;
      const metrics: RefinedSegmentationMetrics = {
        postProcessMs: performance.now() - postStart,
        foregroundRatio: foregroundAfterCleanup / Math.max(1, pixelCount),
        noiseRatio: removedNoise / Math.max(1, foregroundBeforeCleanup),
        stabilityDelta: stabilityAccum / Math.max(1, pixelCount),
      };

      return {
        width,
        height,
        rawCanvas: rawCanvasBundle.canvas,
        smoothCanvas: smoothCanvasBundle.canvas,
        binaryCanvas: binaryCanvasBundle.canvas,
        metrics,
        smoothData: new Float32Array(spatial),
        binaryMask,
      };
    },
  };
};
