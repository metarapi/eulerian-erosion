/**
 * Initialize buffers for the simplified single-resolution pipeline.
 * @param {GPUDevice} device
 * @param {Object} config
 * @returns {Object}
 */
export async function initBuffers(device, config) {
    const {
        // Size
        sizeX = 1024,
        sizeY = 1024,

        // Noise
        octaves = 8,
        zoom = 3.0,
        persistence = 0.6,
        warpFactor = 0.5,
        seed = 42,

        // Erosion control
        iterations = 1024,

        // Hydraulic
        spawnCycles = 64,
        depositionRate = 0.1,
        evapRate = 0.001,
        waterHeightFactor = 0.001,
        stillWaterRelaxation = 0.3,
        spawnDensity = 0.05,
        randomSeed = 42,
        flowDepthWeight = 0.25,
        shearShallow = 5e-7,
        shearDeep = 5e-6,

        // Thermal
        talusWet = 0.013245,
        talusImmersed = 0.0074092,
        talusLowHeight = 0.40,
        talusHighHeight = 0.80,
        talusDryLow = 0.01,
        talusDryHigh = 0.005,
        flowWetMin = 0.002,
        flowWetMax = 0.02,
        immerseMinX = 1.5,
        immerseMaxX = 12.0,
        thermalStrength = 0.15,
        thermalMaxDeltaPerPass = 0.0025,

        // Margolus
        margolusPasses = 64,
        margolusBinarySearchIterations = 8
    } = config;

    // --- Uniform buffers ---

    // Erosion parameters (matches erosionPingPongFD8.wgsl ErosionParams)
    // Pad to 64 bytes for cleanliness (16 * 4)
    {
        const buf = new ArrayBuffer(16 * 4);
        const v = new DataView(buf);
        let o = 0;
        v.setUint32(o, sizeX, true); o += 4;                    // size_x
        v.setUint32(o, sizeY, true); o += 4;                    // size_y
        v.setUint32(o, 0, true); o += 4;                        // iteration (will update per step)
        v.setUint32(o, iterations, true); o += 4;               // max_iterations
        v.setUint32(o, spawnCycles, true); o += 4;              // spawn_cycles
        v.setFloat32(o, depositionRate, true); o += 4;          // deposition_rate
        v.setFloat32(o, evapRate, true); o += 4;                // evap_rate
        v.setFloat32(o, waterHeightFactor, true); o += 4;       // water_height_factor
        v.setFloat32(o, stillWaterRelaxation, true); o += 4;    // still_water_relaxation
        v.setFloat32(o, spawnDensity, true); o += 4;            // spawn_density
        v.setUint32(o, randomSeed, true); o += 4;               // random_seed
        v.setFloat32(o, flowDepthWeight, true); o += 4;         // flow_depth_weight
        v.setFloat32(o, shearShallow, true); o += 4;            // shear_shallow
        v.setFloat32(o, shearDeep, true); o += 4;               // shear_deep
        // pad 8 bytes
        var erosionParamsBuffer = device.createBuffer({
            size: 16 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(erosionParamsBuffer, 0, buf);
    }

    // Still water params (used by redistribution and thermal)
    {
        const buf = new ArrayBuffer(4 * 4);
        const v = new DataView(buf);
        let o = 0;
        v.setUint32(o, sizeX, true); o += 4;                 // size_x
        v.setUint32(o, sizeY, true); o += 4;                 // size_y
        v.setFloat32(o, waterHeightFactor, true); o += 4;    // water_height_factor
        v.setFloat32(o, stillWaterRelaxation, true);         // still_water_relaxation
        var stillWaterParamsBuffer = device.createBuffer({
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(stillWaterParamsBuffer, 0, buf);
    }

    // Thermal params
    {
        const buf = new ArrayBuffer(12 * 4);
        const v = new DataView(buf);
        let o = 0;
        v.setFloat32(o, talusWet, true); o += 4;
        v.setFloat32(o, talusImmersed, true); o += 4;
        v.setFloat32(o, talusLowHeight, true); o += 4;
        v.setFloat32(o, talusHighHeight, true); o += 4;
        v.setFloat32(o, talusDryLow, true); o += 4;
        v.setFloat32(o, talusDryHigh, true); o += 4;
        v.setFloat32(o, flowWetMin, true); o += 4;
        v.setFloat32(o, flowWetMax, true); o += 4;
        v.setFloat32(o, immerseMinX, true); o += 4;
        v.setFloat32(o, immerseMaxX, true); o += 4;
        v.setFloat32(o, thermalStrength, true); o += 4;
        v.setFloat32(o, thermalMaxDeltaPerPass, true);
        var thermalParamsBuffer = device.createBuffer({
            size: 12 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(thermalParamsBuffer, 0, buf);
    }

    // Noise params (matches fBmSimplexNoiseWithDomainWarp.wgsl HeightmapParams)
    // struct: u32 size_x, u32 size_y, u32 octaves, f32 zoom, f32 persistence, f32 seed, f32 warp_factor
    // allocate 8*4 to keep 16-byte multiple
    {
        const buf = new ArrayBuffer(8 * 4);
        const v = new DataView(buf);
        let o = 0;
        v.setUint32(o, sizeX, true); o += 4;
        v.setUint32(o, sizeY, true); o += 4;
        v.setUint32(o, octaves, true); o += 4;
        v.setFloat32(o, zoom, true); o += 4;
        v.setFloat32(o, persistence, true); o += 4;
        v.setFloat32(o, seed, true); o += 4;
        v.setFloat32(o, warpFactor, true); o += 4;
        // pad 4 bytes
        var noiseParamsBuffer = device.createBuffer({
            size: 8 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(noiseParamsBuffer, 0, buf);
    }

    // Margolus params (binary search iterations internal to shader)
    {
        const buf = new ArrayBuffer(12 * 4);
        const v = new DataView(buf);
        let o = 0;
        v.setUint32(o, sizeX, true); o += 4;                      // size_x
        v.setUint32(o, sizeY, true); o += 4;                      // size_y
        v.setUint32(o, 0, true); o += 4;                          // offset_x (updated during passes)
        v.setUint32(o, 0, true); o += 4;                          // offset_y (updated during passes)
        v.setUint32(o, margolusBinarySearchIterations, true); o += 4; // num_iterations (binary search steps)
        // pad vec3<u32>
        v.setUint32(o, 0, true); o += 4;
        v.setUint32(o, 0, true); o += 4;
        v.setUint32(o, 0, true); o += 4;
        var margolusParamsBuffer = device.createBuffer({
            size: 12 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(margolusParamsBuffer, 0, buf);
    }

    // --- Storage textures (single resolution) ---
    const terrainTexPing = device.createTexture({
        size: [sizeX, sizeY, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
    });
    const terrainTexPong = device.createTexture({
        size: [sizeX, sizeY, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
    });

    const waterTexPing = device.createTexture({
        size: [sizeX, sizeY, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
    });
    const waterTexPong = device.createTexture({
        size: [sizeX, sizeY, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
    });

    const noiseTex = device.createTexture({
        size: [sizeX, sizeY, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
    });

    return {
        // Uniform buffers
        erosionParamsBuffer,
        stillWaterParamsBuffer,
        thermalParamsBuffer,
        noiseParamsBuffer,
        margolusParamsBuffer,

        // Storage textures
        noiseTex,
        terrainTexPing, terrainTexPong,
        waterTexPing, waterTexPong,

        // For convenience (used by the simulation loop)
        sizeX, sizeY,
        iterations,
        margolusPasses
    };
}

