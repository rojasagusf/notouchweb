export type SegmentationStatus = "idle" | "loading" | "ready" | "error" | "unsupported";

export type PersonSegmentationMask = {
  width: number;
  height: number;
  data: Float32Array;
  timestampMs: number;
};

export type PersonSegmentationProvider = {
  status: SegmentationStatus;
  errorMessage: string | null;
  initialize: () => Promise<void>;
  segmentVideoFrame: (video: HTMLVideoElement, timestampMs: number) => PersonSegmentationMask | null;
  dispose: () => void;
};
