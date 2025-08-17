# Eulerian Multigrid-Inspired FD8 Hydraulic Erosion

A high-performance WebGPU-based simulation of hydraulic erosion using Eulerian multigrid-inspired methods with FD8 multi-directional flow routing for realistic terrain generation. 
[**Live Demo**](https://metarapi.github.io/multigrid-eulerian-erosion/)

## Technical Overview

### Hydraulic Erosion Simulation

The core simulation implements a **multigrid-inspired approach** with FD8 multi-directional flow routing for accurate water flow and sediment transport:

- **Multigrid Resolution:** Four grid levels (L1–L4) simulate erosion processes at different scales, from fine detail to broad landscape features
- **FD8 Flow Routing:** Multi-directional water flow algorithm that distributes flow across all 8 neighboring cells (unlike D8 single-direction routing), enabling more realistic water distribution patterns
- **Coupled Water-Sediment Dynamics:** Models evaporation, deposition, erosion capacity, and momentum transfer between water and terrain
- **Real-time GPU Acceleration:** All simulation steps run on GPU using WebGPU compute shaders for interactive performance

### Terrain Generation Pipeline

1. **Initial Heightfield:** Starting terrain mesh or procedural generation
2. **Water Simulation:** Precipitation, flow accumulation, and velocity calculations using FD8 multi-directional flow routing
3. **Erosion Process:** Sediment pickup based on flow velocity and carrying capacity
4. **Deposition:** Sediment settling in low-velocity areas
5. **Terrain Update:** Height modification based on erosion/deposition balance

### Visualization

- **3D Terrain Rendering:** Babylon.js with WebGPU for interactive terrain visualization
- **Multi-layer Display:** Separate visualization of height, flowing water, still water, and sediment at each grid level
- **Advanced Coloring:** Custom lookup tables (LUTs) generated using Oklab color space interpolation for perceptually uniform terrain and water colors

### Color Science

Terrain and water colors use **Oklab color interpolation** for smooth, perceptually accurate gradients:
- Python-based LUT generation (`src/python/LUTMaker.ipynb`) with colour-science library
- Runtime texture generation from pre-computed LUTs
- Support for custom color themes and palettes

## Getting Started

### Prerequisites
- Node.js (v18+)
- Modern browser with [WebGPU support](https://webgpu.io/)

### Quick Start
```sh
npm install
npm run dev
```

Visit [http://localhost:3006](http://localhost:3006)

### Build for Production
```sh
npm run build
npm run preview
```

## Key Parameters

- **Erosion Iterations:** Number of simulation steps per frame
- **Spawn Cycles:** Water injection frequency
- **Deposition Rate:** Sediment settling speed
- **Evaporation Rate:** Water loss per iteration
- **Water Height Factor:** Scaling for water visualization

## Architecture

The simulation uses a modular WebGPU pipeline with separate compute shaders for:
- Water flow calculations (FD8 multi-directional flow routing)
- Erosion and deposition
- Multigrid-inspired interpolation and restriction
- Texture generation and coloring

Interactive controls built with Alpine.js allow real-time parameter adjustment during simulation.

## Dependencies

- `@babylonjs/core` - 3D rendering engine
- `alpinejs` - Reactive UI framework
- `flyonui` + `tailwindcss` - Styling and components
- `vite` + `vite-plugin-glsl` - Build system with shader support

## Attribution & References

This project uses or adapts code under the MIT License from the following sources:

- **PCG Random Number Generation**  
  [Melissa E. O’Neill, pcg-random.org](https://www.pcg-random.org/)  
  MIT License. © Melissa E. O’Neill

- **Simplex Noise Functions**  
  MIT License. © Ian McEwan, Stefan Gustavson, Munrocket

- **Fractal Brownian Motion (FBM)**  
  MIT License. © Inigo Quilez, Munrocket

## License

MIT

## Author

[metarapi](https://github.com/metarapi)