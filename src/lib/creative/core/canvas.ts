import { clamp } from "../math";

export type CanvasDimensions = {
  width: number;
  height: number;
  dpr: number;
};

export type CoverSourceRect = {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
};

export const createCanvasDimensions = (
  width = 1,
  height = 1,
  dpr = 1,
): CanvasDimensions => ({
  width,
  height,
  dpr,
});

export const resizeCanvasToViewport = (payload: {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  maxDevicePixelRatio: number;
  minWidth?: number;
  minHeight?: number;
  dimensions: CanvasDimensions;
}) => {
  const { canvas, context, dimensions, maxDevicePixelRatio, minWidth = 1, minHeight = 1 } = payload;
  const viewportWidth = Math.max(window.innerWidth, minWidth);
  const viewportHeight = Math.max(window.innerHeight, minHeight);
  const dpr = clamp(window.devicePixelRatio || 1, 1, maxDevicePixelRatio);

  dimensions.width = viewportWidth;
  dimensions.height = viewportHeight;
  dimensions.dpr = dpr;

  canvas.width = Math.floor(viewportWidth * dpr);
  canvas.height = Math.floor(viewportHeight * dpr);
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
};

export const computeCoverSourceRect = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CoverSourceRect => {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return {
      sx: 0,
      sy: 0,
      sWidth: sourceWidth,
      sHeight: sourceHeight,
    };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const sHeight = sourceHeight;
    const sWidth = sHeight * targetAspect;
    const sx = (sourceWidth - sWidth) * 0.5;

    return {
      sx,
      sy: 0,
      sWidth,
      sHeight,
    };
  }

  const sWidth = sourceWidth;
  const sHeight = sWidth / targetAspect;
  const sy = (sourceHeight - sHeight) * 0.5;

  return {
    sx: 0,
    sy,
    sWidth,
    sHeight,
  };
};
