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

## How It Works

The simulation is a multi-stage process orchestrated entirely on the GPU.

### 1. Terrain Generation
An initial heightmap is generated using domain-warped Simplex noise. This creates natural-looking terrain with varied features, controlled by parameters like octaves, persistence, and warp factor.

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

1.  **Initialization**:
    -   A domain-warped fBm noise texture is generated (`fBmSimplexNoise.wgsl`).
    -   This is copied to the initial terrain texture. Water textures are initialized to zero.

2.  **Erosion Loop** (runs for `iterations`):
    -   **Pass 1**: Hydraulic Erosion (`erosionPingPongFD8.wgsl`)
    -   **Pass 2**: Still Water Redistribution (`stillWaterRedistribution.wgsl`)
    -   **Pass 3**: Thermal Erosion (`thermalErosion.wgsl`)
    -   *Textures are ping-ponged between passes to use the output of one step as the input for the next.*

3.  **Final Equilibration Loop** (runs for `margolusPasses`):
    -   The `margolusBinaryWaterRedistribution.wgsl` shader is dispatched four times per pass with different checkerboard offsets to process all cell boundaries.

4.  **Readback & Visualization**:
    -   The final terrain and water textures are copied from the GPU to the CPU for visualization with Babylon.js.

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

## Key Parameters

A detailed tooltip is available for each parameter in the UI.

-   **General**: `Resolution`, `Iterations`
-   **Hydraulic Erosion**: `spawnCycles`, `spawnDensity`, `evapRate`, `depositionRate`, `flowDepthWeight`, `shearShallow`, `shearDeep`
-   **Water System**: `waterHeightFactor`, `stillWaterRelaxation`
-   **Thermal Erosion**: `thermalStrength`, `maxDeltaPerPass`, and various moisture-based `talus` angles.
-   **Final Equilibration**: `margolusPasses`, `margolusBinarySearchIterations`
-   **Terrain Generation**: `octaves`, `zoom`, `persistence`, `warpFactor`, `seed`

## Core Shaders

-   `fBmSimplexNoise.wgsl`: Procedural terrain generation.
-   `erosionPingPongFD8.wgsl`: The core hydraulic erosion and transport engine.
-   `stillWaterRedistribution.wgsl`: Intra-iteration water settling.
-   `thermalErosion.wgsl`: Moisture-aware thermal weathering.
-   `margolusBinaryWaterRedistribution.wgsl`: Final, mass-conserving water equilibration.

## Dependencies

-   `@babylonjs/core`: 3D rendering engine
-   `alpinejs`: Reactive UI framework
-   `flyonui` + `tailwindcss`: UI styling and components
-   `vite` + `vite-plugin-glsl`: Build system and shader bundling

## License

MIT