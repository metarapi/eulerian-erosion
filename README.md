# Eulerian Hydraulic Erosion with Binary Search Water Redistribution

A high-performance WebGPU-based hydraulic erosion simulation using FD8 multi-directional flow routing and GPU compute shaders. This implementation combines flowing water dynamics with a novel Margolus neighborhood binary search approach for stable water equilibration.

Live demo: https://metarapi.github.io/eulerian-erosion/

## Key Features

- **FD8 Flow Routing**: Multi-directional water flow using adaptive slope exponents that respond to terrain curvature - water spreads on hillslopes and concentrates in valleys
- **Dual Water System**: Separates flowing water (erosion and transport) from still water (storage and equilibration) 
- **Binary Search Equilibration**: Uses Margolus neighborhoods (2x2 blocks) with binary search to find water level equilibrium, ensuring mass conservation
- **Moisture-Aware Thermal Erosion**: Thermal erosion that adapts based on water presence - wet slopes are more stable than dry ones
- **Domain-Warped Noise**: Fast GPU-generated terrain using fractal Brownian motion with domain warping for realistic initial landscapes

## How It Works

### Water Flow (FD8)
Water flows downhill using an 8-direction scheme where flow distribution adapts to terrain shape:
- **Ridges/slopes**: Lower exponent spreads water broadly
- **Valleys**: Higher exponent concentrates flow into channels
- Uses terrain curvature (Laplacian) to automatically adjust flow behavior

### Water Types
- **Flowing Water**: Actively erodes terrain, carries sediment, follows gravity
- **Still Water**: Pools in low areas, provides moisture for thermal erosion, equilibrates through binary search

### Erosion & Deposition
- Flowing water picks up sediment based on flow velocity and terrain slope
- Excess sediment deposits when water slows or pools
- Thermal erosion loosens material on steep slopes, especially when dry

### Water Redistribution System
The simulation uses a two-stage approach for water management:

**Still Water Redistribution**: During erosion iterations, still water flows between neighboring cells based on height differences, creating local equilibration while preserving the overall flow dynamics.

**Final Margolus Equilibration**: After all erosion iterations, a separate binary search process runs on 2x2 Margolus neighborhoods to smooth out any remaining water distribution noise:
- Divides terrain into overlapping 2x2 blocks with different offset patterns
- Binary search finds the exact water level that equalizes pressure across each block
- Runs multiple passes with checkerboard patterns to ensure global equilibration
- Preserves total water mass while creating realistic ponding behavior

## Pipeline Overview

1. **Generate Terrain**: Domain-warped fBm noise creates initial heightfield
2. **Erosion Loop** (per iteration):
   - Hydraulic erosion with FD8 flow routing
   - Still water redistribution for local equilibration  
   - Thermal erosion based on moisture state
3. **Final Equilibration**: Multiple Margolus passes with binary search for stable water levels
4. **Visualization**: Extract final terrain and water data for rendering

## Getting Started

**Prerequisites**
- Node.js (v18+)
- Browser with WebGPU support

**Quick Start**
```sh
npm install
npm run dev
```
Visit: http://localhost:3000

**Build for Production**
```sh
npm run build
npm run preview
```

## Key Parameters

- **Resolution**: Grid size (sizeX, sizeY)
- **Iterations**: Number of erosion cycles
- **Water Spawning**: spawn_cycles, spawn_density
- **Flow Dynamics**: deposition_rate, evap_rate, flow_depth_weight
- **Thermal**: moisture-dependent talus angles
- **Equilibration**: margolusPasses, binary search iterations
- **Terrain**: noise octaves, zoom, persistence, domain warping

## Core Shaders

- **fBmSimplexNoise.wgsl**: Domain-warped fractal terrain generation
- **erosionPingPongFD8.wgsl**: Adaptive flow routing with erosion/deposition
- **stillWaterRedistribution.wgsl**: Local water redistribution during erosion iterations
- **thermalErosion.wgsl**: Moisture-aware slope stability and material transport
- **margolusBinaryWaterRedistribution.wgsl**: Final binary search water leveling in 2x2 blocks

## Technical Approach

The simulation runs entirely on GPU using ping-pong textures for efficient memory access. The two-stage water system allows for realistic flow dynamics during erosion while ensuring final water distributions are smooth and physically plausible. The Margolus binary search technique is particularly effective at eliminating water distribution artifacts while maintaining strict mass conservation.

## Dependencies

- `@babylonjs/core` - 3D rendering engine
- `alpinejs` - Reactive UI framework  
- `flyonui` + `tailwindcss` - Styling and components
- `vite` + `vite-plugin-glsl` - Build system with shader support

## License

MIT

## Author