export type CameraStatus = "idle" | "starting" | "ready" | "error" | "stopped";

export type WebcamFrameSize = {
  width: number;
  height: number;
};

export type WebcamProvider = {
  video: HTMLVideoElement;
  stream: MediaStream | null;
  status: CameraStatus;
  errorMessage: string | null;
  frameSize: WebcamFrameSize;
  start: () => Promise<void>;
  stop: () => void;
};
