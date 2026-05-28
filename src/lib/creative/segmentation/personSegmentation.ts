import type {
  PersonSegmentationMask,
  PersonSegmentationProvider,
} from "./types";
import { clamp } from "../math";

type VisionModule = {
  FilesetResolver: {
    forVisionTasks: (basePath?: string) => Promise<unknown>;
  };
  ImageSegmenter: {
    createFromOptions: (
      fileset: unknown,
      options: {
        baseOptions: {
          modelAssetPath: string;
          delegate: "GPU" | "CPU";
        };
        runningMode: "VIDEO";
        outputConfidenceMasks: boolean;
      },
    ) => Promise<{
      close: () => void;
      segmentForVideo: (video: HTMLVideoElement, timestampMs: number) => unknown;
    }>;
  };
};

type CreatePersonSegmentationProviderPayload = {
  wasmBaseUrl?: string;
  modelAssetPath?: string;
};

const LOCAL_WASM_BASE_URL = new URL(
  "../../../../vendor/mediapipe/tasks-vision/wasm",
  import.meta.url,
).href;
const CDN_WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const DEFAULT_MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

const toConfidenceMask = (rawMask: Uint8Array | Uint8ClampedArray) => {
  const mask = new Float32Array(rawMask.length);

  for (let index = 0; index < rawMask.length; index += 1) {
    mask[index] = clamp(rawMask[index] / 255, 0, 1);
  }

  return mask;
};

const extractMask = (result: unknown, timestampMs: number): PersonSegmentationMask | null => {
  const maybeResult = result as {
    categoryMask?: {
      width?: number;
      height?: number;
      getAsUint8Array?: () => Uint8Array;
      close?: () => void;
    };
    confidenceMasks?: Array<{
      width?: number;
      height?: number;
      getAsFloat32Array?: () => Float32Array;
      close?: () => void;
    }>;
  };

  const confidenceMask = maybeResult.confidenceMasks?.[0];

  if (confidenceMask?.getAsFloat32Array) {
    const data = confidenceMask.getAsFloat32Array();
    const width = confidenceMask.width ?? 0;
    const height = confidenceMask.height ?? 0;
    confidenceMask.close?.();

    if (width <= 0 || height <= 0 || width * height !== data.length) {
      return null;
    }

    return {
      width,
      height,
      data,
      timestampMs,
    };
  }

  const categoryMask = maybeResult.categoryMask;

  if (categoryMask?.getAsUint8Array) {
    const raw = categoryMask.getAsUint8Array();
    const width = categoryMask.width ?? 0;
    const height = categoryMask.height ?? 0;
    const data = toConfidenceMask(raw);
    categoryMask.close?.();

    if (width <= 0 || height <= 0 || width * height !== data.length) {
      return null;
    }

    return {
      width,
      height,
      data,
      timestampMs,
    };
  }

  return null;
};

const loadVisionModule = async (): Promise<VisionModule> => {
  try {
    return (await import("@mediapipe/tasks-vision")) as unknown as VisionModule;
  } catch {
    const localModuleUrl = new URL(
      "../../../../vendor/mediapipe/tasks-vision/vision_bundle.mjs",
      import.meta.url,
    ).href;

    return (await import(localModuleUrl)) as unknown as VisionModule;
  }
};

export const createPersonSegmentationProvider = (
  payload: CreatePersonSegmentationProviderPayload = {},
): PersonSegmentationProvider => {
  const wasmBaseUrl = payload.wasmBaseUrl ?? LOCAL_WASM_BASE_URL;
  const modelAssetPath = payload.modelAssetPath ?? DEFAULT_MODEL_ASSET_PATH;

  let segmenter: {
    close: () => void;
    segmentForVideo: (video: HTMLVideoElement, timestampMs: number) => unknown;
  } | null = null;

  const provider: PersonSegmentationProvider = {
    status: "idle",
    errorMessage: null,
    initialize: async () => {
      if (provider.status === "loading" || provider.status === "ready") {
        return;
      }

      if (typeof window === "undefined") {
        provider.status = "unsupported";
        provider.errorMessage = "Segmentation is available only in the browser.";
        return;
      }

      provider.status = "loading";
      provider.errorMessage = null;

      try {
        const visionTasks = await loadVisionModule();

        let fileset: unknown;
        try {
          fileset = await visionTasks.FilesetResolver.forVisionTasks(wasmBaseUrl);
        } catch {
          fileset = await visionTasks.FilesetResolver.forVisionTasks(CDN_WASM_BASE_URL);
        }

        try {
          segmenter = await visionTasks.ImageSegmenter.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            outputConfidenceMasks: true,
          });
        } catch {
          segmenter = await visionTasks.ImageSegmenter.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            outputConfidenceMasks: true,
          });
        }

        provider.status = "ready";
      } catch (error) {
        provider.status = "error";
        provider.errorMessage =
          error instanceof Error ? error.message : "Unable to initialize person segmentation.";
      }
    },
    segmentVideoFrame: (video: HTMLVideoElement, timestampMs: number) => {
      if (!segmenter || provider.status !== "ready") {
        return null;
      }

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0) {
        return null;
      }

      try {
        const result = segmenter.segmentForVideo(video, timestampMs);
        return extractMask(result, timestampMs);
      } catch {
        provider.status = "error";
        provider.errorMessage = "Segmentation failed while processing camera frames.";
        return null;
      }
    },
    dispose: () => {
      if (segmenter) {
        segmenter.close();
      }

      segmenter = null;
      provider.status = "idle";
    },
  };

  return provider;
};
