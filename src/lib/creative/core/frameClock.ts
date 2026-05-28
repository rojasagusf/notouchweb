export type FrameClock = {
  elapsedSeconds: number;
  deltaSeconds: number;
};

export const createFrameClock = (): FrameClock => ({
  elapsedSeconds: 0,
  deltaSeconds: 0,
});

export const advanceFrameClock = (
  frameClock: FrameClock,
  rawDeltaSeconds: number,
  maxDeltaSeconds: number,
) => {
  const safeDeltaSeconds = Math.min(Math.max(rawDeltaSeconds, 0), maxDeltaSeconds);

  frameClock.deltaSeconds = safeDeltaSeconds;
  frameClock.elapsedSeconds += safeDeltaSeconds;
};
