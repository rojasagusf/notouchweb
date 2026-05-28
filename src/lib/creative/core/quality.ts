export type CreativeQualityTier = "high" | "medium" | "low";

export type CreativeQualityProfile = {
  tier: CreativeQualityTier;
  maxDevicePixelRatio: number;
  processingFps: number;
  processingWidth: number;
  processingHeight: number;
  segmentationFps: number;
  segmentationSampleStep: number;
  maxParticleTargets: number;
  particleCount: number;
};

export const createCreativeQualityProfile = (): CreativeQualityProfile => {
  const hardwareConcurrency = navigator.hardwareConcurrency ?? 4;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const isSmallViewport = window.innerWidth < 900;

  if (hardwareConcurrency <= 4 || deviceMemory <= 4 || isSmallViewport) {
    if (hardwareConcurrency <= 2 || deviceMemory <= 2) {
      return {
        tier: "low",
        maxDevicePixelRatio: 1.5,
        processingFps: 18,
        processingWidth: 112,
        processingHeight: 64,
        segmentationFps: 18,
        segmentationSampleStep: 4,
        maxParticleTargets: 2200,
        particleCount: 2800,
      };
    }

    return {
      tier: "medium",
      maxDevicePixelRatio: 1.75,
      processingFps: 22,
      processingWidth: 144,
      processingHeight: 84,
      segmentationFps: 28,
      segmentationSampleStep: 3,
      maxParticleTargets: 3600,
      particleCount: 5200,
    };
  }

  return {
    tier: "high",
    maxDevicePixelRatio: 2,
    processingFps: 28,
    processingWidth: 192,
    processingHeight: 108,
    segmentationFps: 32,
    segmentationSampleStep: 2,
    maxParticleTargets: 5600,
    particleCount: 7600,
  };
};
