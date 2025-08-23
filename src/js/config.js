export const config = {
    // Map size (square)
    sizeX: 512,
    sizeY: 512,

    // Noise (fBm + domain warp)
    octaves: 8,            // Number of octaves
    zoom: 3.0,             // Base frequency zoom factor
    persistence: 0.6,      // Amplitude scaling per octave (0.5-0.65 typical)
    warpFactor: 0.03,      // Domain warp strength (0 disables warp)
    seed: 42,              // Seed for noise
    // If you want erosion PRNG to match noise seed, set randomSeed = seed
    randomSeed: 42,

    // Erosion loop (one “iteration” is the triplet: Hydraulic -> Redistribution -> Thermal)
    iterations: 1024,

    // Hydraulic erosion (FD8/Quinn)
    spawnCycles: 64,
    depositionRate: 0.1,
    evapRate: 0.001,
    waterHeightFactor: 0.001,
    stillWaterRelaxation: 0.3,
    spawnDensity: 0.05,
    flowDepthWeight: 0.25,   // fraction of flowing water added to depth
    shearShallow: 5e-7,      // onset
    shearDeep: 5e-6,         // full strength

    // Thermal erosion
    talusWet: 0.013245,
    talusImmersed: 0.0074092,
    talusLowHeight: 0.40,
    talusHighHeight: 0.80,
    talusDryLow: 0.01,
    talusDryHigh: 0.005,
    flowWetMin: 0.002,
    flowWetMax: 0.02,
    immerseMinX: 1.5,
    immerseMaxX: 12.0,
    thermalStrength: 0.15,
    thermalMaxDeltaPerPass: 0.0025,

    // Final water leveling (Margolus)
    margolusPasses: 64,                 // number of 2x2 neighborhood passes
    margolusBinarySearchIterations: 8 // iterations inside shader's binary search
};

export const defaultConfig = { ...config };