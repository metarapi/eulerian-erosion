# Eulerian Hydraulic Erosion with Advanced Water Simulation

A high-performance WebGPU-based hydraulic erosion simulation that combines multi-directional flow routing with a unique dual-stage water redistribution system for physically plausible results.

**Live Demo: https://metarapi.github.io/eulerian-erosion/**

## Key Features

-   **Adaptive FD8 Flow Routing**: Utilizes an 8-direction flow model where the distribution exponent adapts to terrain curvature, allowing water to spread realistically on slopes and concentrate in valleys.
-   **Dual Water System**: Separates water into two types—**flowing water** for erosion and sediment transport, and **still water** for pooling in depressions and influencing thermal erosion.
-   **Shear Stress Erosion Model**: Erosion is gated by shear stress, preventing unrealistic erosion from shallow or slow-moving water and concentrating erosive power in deep, fast channels.
-   **Moisture-Aware Thermal Erosion**: The stability of terrain (angle of repose) is dynamically adjusted based on its moisture level, considering surface wetness from flowing water and full immersion in still water.
-   **Two-Stage Water Redistribution**: A novel combination of a continuous, relaxed redistribution during erosion and a final, mass-conserving equilibration step using a Margolus neighborhood binary search.
-   **Procedural Terrain Generation**: Generates initial landscapes using GPU-accelerated, domain-warped fractal Brownian motion (fBm).
-   **Mountain Chain Synthesis via JFA Blending** (new): Thresholded noise produces seed “ridge nuclei”; a Jump Flood Algorithm builds a distance field whose normalized result is blended with the original noise to create coherent ridge / valley belts. A blend factor lets you interpolate between organic noise and structured mountain chains.
-   **Atomic-Reduced Normalization**: A single atomic max reduction during the final JFA pass provides a global distance scale for stable, resolution‑independent blending.

## How It Works

The simulation is a multi-stage process orchestrated entirely on the GPU.

### 1. Terrain Generation & Structural Preprocessing (New)
1.  **Thresholded Domain-Warped fBm** (`fBmSimplexNoiseThresholdedForJFA.wgsl`)  
    - Produces both a base heightmap (0–1) and seed points where height exceeds `jfaThreshold`.
    - Seeds encode their own (x,y,height) and initialize distance α with a large sentinel elsewhere.
2.  **Jump Flood Algorithm (JFA)** (`JFAwithAtomicMax.wgsl`)  
    - Propagates nearest-seed information in O(log N) passes with decreasing step sizes.
    - Final pass performs a workgroup reduction + global `atomicMax` to capture maximum Euclidean distance (Q16.16 fixed-point) for later normalization.
3.  **Height / Distance Blending** (`blendWithNormalize.wgsl`)  
    - Normalizes the distance field using the recorded max.
    - Inverts the raw noise (optional stylistic emphasis) and linearly blends with the normalized distance:
      `final = mix(invertedHeight, distanceNorm, blendFactor)`
    - `blendFactor = 0` → pure organic noise; `1` → fully chain‑structured terrain.
4.  **Result Copy** → becomes the initial terrain fed into erosion.

### 2. The Erosion Loop
The simulation runs for a specified number of iterations. Each iteration consists of three main steps that are executed in sequence:

1.  **Hydraulic Erosion (`erosionPingPongFD8.wgsl`)**:
    -   Calculates water flow between cells based on the total water surface height (terrain + water).
    -   Flow is concentrated or spread based on the terrain's Laplacian (curvature).
    -   Erosion and deposition occur based on water velocity, slope, and sediment capacity. A shear stress model (`shearShallow`, `shearDeep`) ensures erosion only happens in sufficiently powerful flows.
    -   Flowing water is subject to evaporation.

2.  **Still Water Redistribution (`stillWaterRedistribution.wgsl`)**:
    -   This pass allows still water to settle locally.
    -   It moves a fraction of the water from cells to their lower neighbors, governed by a relaxation factor (`still_water_relaxation`) to ensure stability and prevent oscillations. This acts as a fast, localized "settling" step within the main erosion loop.

3.  **Thermal Erosion (`thermalErosion.wgsl`)**:
    -   Simulates slope failure and material transport due to gravity.
    -   The angle of repose (talus angle) is not fixed; it's calculated dynamically based on terrain height and moisture. The system interpolates between different talus angles for dry, wet, and fully submerged terrain, creating more realistic landslides and slope formations.

### 3. Final Water Equilibration
After the main erosion loop completes, a final set of passes is run to ensure all still water has settled into a physically stable state, forming flat lakes and ponds.

-   **Margolus Binary Search (`margolusBinaryWaterRedistribution.wgsl`)**:
    -   The grid is processed in 2x2 blocks (Margolus neighborhoods).
    -   For each block, a binary search algorithm finds the precise water level that conserves the total water volume within that block, effectively making the water surface flat.
    -   This process is repeated over multiple passes with different offsets (`margolusPasses`) to ensure water can equilibrate across the entire map, eliminating artifacts and ensuring global mass conservation.

## Pipeline Overview

1.  **Initialization / Structural Preprocessing**:
    - Thresholded, domain-warped fBm generation (height + JFA seeds).
    - Jump Flood passes (ping‑pong) with final distance max reduction.
    - Blending of normalized distance field with original noise via `blendFactor`.
    - Copy blended terrain to erosion input.
2.  **Erosion Loop** (runs for `iterations`):
    - Pass 1: Hydraulic Erosion (`erosionPingPongFD8.wgsl`)
    - Pass 2: Still Water Redistribution (`stillWaterRedistribution.wgsl`)
    - Pass 3: Thermal Erosion (`thermalErosion.wgsl`)
3.  **Final Equilibration Loop**:
    - Margolus binary-search redistribution (`margolusBinaryWaterRedistribution.wgsl`)
4.  **Readback & Visualization**:
    - Terrain + water staging buffers → Babylon.js.

## Key Parameters

A detailed tooltip is available for each parameter in the UI.

-   **General**: `Resolution`, `Iterations`
-   **Terrain Generation / Structure**: `octaves`, `zoom`, `persistence`, `warpFactor`, `seed`
-   **Mountain Chain Blending (new)**:
    - `jfaThreshold`: Controls density of ridge seeds (higher → sparser, more dominant chains).
    - `blendFactor`: 0 = pure noise; 1 = fully distance-structured ridges.
-   **Hydraulic Erosion**: `spawnCycles`, `spawnDensity`, `evapRate`, `depositionRate`, `flowDepthWeight`, `shearShallow`, `shearDeep`
-   **Water System**: `waterHeightFactor`, `stillWaterRelaxation`
-   **Thermal Erosion**: `thermalStrength`, `maxDeltaPerPass`, moisture + elevation talus angles
-   **Final Equilibration**: `margolusPasses`, `margolusBinarySearchIterations`

## Core Shaders

-   `fBmSimplexNoiseThresholdedForJFA.wgsl`: Domain-warped fBm + ridge seed thresholding.
-   `JFAwithAtomicMax.wgsl`: Jump Flood nearest-seed propagation + atomic max distance reduction.
-   `blendWithNormalize.wgsl`: Normalizes distance (using reduced max) and blends with noise.
-   `erosionPingPongFD8.wgsl`: Hydraulic erosion & sediment transport.
-   `stillWaterRedistribution.wgsl`: Iterative intra-loop settling.
-   `thermalErosion.wgsl`: Moisture & elevation adaptive talus relaxation.
-   `margolusBinaryWaterRedistribution.wgsl`: Mass-conserving still water equilibration.

## Notes on JFA Normalization (New)

- Distances are accumulated as float during propagation; only the maximum is quantized (Q16.16) for deterministic normalization.
- Avoids an extra full reduction pass while keeping precision adequate for blending.

## Getting Started

**Prerequisites**
-   Node.js (v18+)
-   A modern browser with WebGPU support (e.g., Chrome, Edge).

**Quick Start**
```sh
npm install
npm run dev
```
Visit `http://localhost:5173` (or the port specified in your terminal).

**Build for Production**
```sh
npm run build
npm run preview
```

## Dependencies

-   `@babylonjs/core`: 3D rendering engine
-   `alpinejs`: Reactive UI framework
-   `flyonui` + `tailwindcss`: UI styling and components
-   `vite` + `vite-plugin-glsl`: Build system and shader bundling

## License

MIT