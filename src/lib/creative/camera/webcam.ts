import type { WebcamProvider } from "./types";

type CreateWebcamProviderPayload = {
  idealWidth?: number;
  idealHeight?: number;
  facingMode?: "user" | "environment";
};

const createVideoElement = () => {
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  return video;
};

export const createWebcamProvider = (
  payload: CreateWebcamProviderPayload = {},
): WebcamProvider => {
  const { idealWidth = 1280, idealHeight = 720, facingMode = "user" } = payload;
  const video = createVideoElement();

  const provider: WebcamProvider = {
    video,
    stream: null,
    status: "idle",
    errorMessage: null,
    frameSize: {
      width: 0,
      height: 0,
    },
    start: async () => {
      if (provider.status === "starting" || provider.status === "ready") {
        return;
      }

      provider.status = "starting";
      provider.errorMessage = null;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode,
            width: { ideal: idealWidth },
            height: { ideal: idealHeight },
          },
        });

        provider.stream = stream;
        provider.video.srcObject = stream;

        await provider.video.play();

        provider.frameSize.width = provider.video.videoWidth;
        provider.frameSize.height = provider.video.videoHeight;
        provider.status = "ready";
      } catch (error) {
        provider.status = "error";
        provider.errorMessage =
          error instanceof Error ? error.message : "Unable to access camera.";
      }
    },
    stop: () => {
      if (provider.stream) {
        for (const track of provider.stream.getTracks()) {
          track.stop();
        }
      }

      provider.stream = null;
      provider.video.srcObject = null;
      provider.status = "stopped";
    },
  };

  provider.video.addEventListener("loadedmetadata", () => {
    provider.frameSize.width = provider.video.videoWidth;
    provider.frameSize.height = provider.video.videoHeight;
  });

  return provider;
};
