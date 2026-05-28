import { computeCoverSourceRect } from "../core/canvas";
import { clamp, randomBetween } from "../math";

export type MirrorTargetPoint = {
  x: number;
  y: number;
  confidence: number;
  weight: number;
  active: boolean;
};

type MaskLike = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

type PersonMaskToTargetsPayload = {
  mask: MaskLike;
  activeMask?: MaskLike | null;
  previousMask: MaskLike | null;
  outputWidth: number;
  outputHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  mirrorX: boolean;
  sampleStep: number;
  threshold: number;
  maxPoints: number;
  jitter: number;
  motionInfluence: number;
};

const reduceDeterministic = (points: MirrorTargetPoint[], maxPoints: number) => {
  if (points.length <= maxPoints || maxPoints <= 0) {
    return points;
  }

  const sampled: MirrorTargetPoint[] = [];
  const lastIndex = points.length - 1;
  const sampleCount = Math.max(1, maxPoints);
  const sampleDenominator = Math.max(1, sampleCount - 1);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const sourceIndex = Math.floor((sampleIndex * lastIndex) / sampleDenominator);
    const point = points[sourceIndex];
    if (point) {
      sampled.push(point);
    }
  }

  return sampled;
};

export const personMaskToTargets = (payload: PersonMaskToTargetsPayload): MirrorTargetPoint[] => {
  const {
    mask,
    activeMask,
    previousMask,
    outputWidth,
    outputHeight,
    sourceWidth,
    sourceHeight,
    mirrorX,
    sampleStep,
    threshold,
    maxPoints,
    jitter,
    motionInfluence,
  } = payload;

  if (mask.width <= 0 || mask.height <= 0 || outputWidth <= 0 || outputHeight <= 0) {
    return [];
  }

  const cover = computeCoverSourceRect(sourceWidth, sourceHeight, outputWidth, outputHeight);
  const scaleX = outputWidth / Math.max(1, cover.sWidth);
  const scaleY = outputHeight / Math.max(1, cover.sHeight);
  const offsetX = -cover.sx * scaleX;
  const offsetY = -cover.sy * scaleY;
  const effectiveStep = Math.max(1, sampleStep);
  const points: MirrorTargetPoint[] = [];

  for (let y = 0; y < mask.height; y += effectiveStep) {
    const rowIndex = Math.floor(y / effectiveStep);
    const rowOffset = rowIndex % 2 === 0 ? 0 : Math.floor(effectiveStep * 0.5);

    for (let x = rowOffset; x < mask.width; x += effectiveStep) {
      const index = y * mask.width + x;
      const confidence = mask.data[index] ?? 0;
      const activeValue = activeMask?.data[index] ?? confidence;
      const previousConfidence = previousMask?.data[index] ?? 0;
      const motionDelta = Math.abs(confidence - previousConfidence);
      const sourceX = ((x + 0.5) / mask.width) * sourceWidth;
      const sourceY = ((y + 0.5) / mask.height) * sourceHeight;
      const projectedX = sourceX * scaleX + offsetX;
      const projectedY = sourceY * scaleY + offsetY;
      const finalX = mirrorX ? outputWidth - projectedX : projectedX;
      const jitterX = jitter > 0 ? randomBetween(-jitter, jitter) : 0;
      const jitterY = jitter > 0 ? randomBetween(-jitter, jitter) : 0;
      const isActive = activeValue >= threshold;

      points.push({
        x: finalX + jitterX,
        y: projectedY + jitterY,
        confidence: clamp(confidence, 0, 1),
        weight: clamp(confidence * 0.65 + motionDelta * motionInfluence, 0, 1),
        active: isActive,
      });
    }
  }

  return reduceDeterministic(points, maxPoints);
};
