export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha;

export const inverseLerp = (value: number, min: number, max: number) => {
  if (max === min) {
    return 0;
  }

  return clamp((value - min) / (max - min), 0, 1);
};

export const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export const damp = (from: number, to: number, lambda: number, deltaSeconds: number) => {
  const blend = 1 - Math.exp(-lambda * deltaSeconds);
  return lerp(from, to, blend);
};
