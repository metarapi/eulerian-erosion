/**
 * Creates all bind group layouts needed for the simulation.
 * @param {GPUDevice} device
 * @returns {Object} All created bind group layouts
 */
export function createBindGroupLayouts(device) {
    // fBm Simplex Noise (with domain warp) - now generates both heightmap AND JFA seeds
    const fBmSimplexNoiseLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }, // heightmap output
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }  // JFA seed output
        ]
    });

    // JFA Algorithm Layout
    const jfaLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // JFA params
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only", format: "rgba32float", viewDimension: "2d" } }, // input texture
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }, // output texture
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } } // atomic max buffer
        ]
    });

    // Blend Layout (heightmap + distance field -> final terrain)
    const blendLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // BlendParams
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only", format: "rgba32float", viewDimension: "2d" } }, // heightmap texture
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only", format: "rgba32float", viewDimension: "2d" } }, // distance texture
            { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }, // output texture (changed to rgba32float)
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } } // max buffer (read-only)
        ]
    });

    // Hydraulic Erosion (Ping -> Pong)
    const erosionPingPongFD8Layout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // ErosionParams
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only",  format: "rgba32float", viewDimension: "2d" } }, // terrain_input
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }, // terrain_output
            { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only",  format: "rgba32float", viewDimension: "2d" } }, // water_input
            { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }  // water_output
        ]
    });

    // Still Water Redistribution (Terrain Pong + Water Pong -> Water Ping)
    const stillWaterRedistributionLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // StillWaterParams
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only",  format: "rgba32float", viewDimension: "2d" } }, // terrain
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only",  format: "rgba32float", viewDimension: "2d" } }, // water_input
            { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }  // water_output
        ]
    });

    // Thermal Erosion (Terrain Pong + Water Ping -> Terrain Ping)
    const thermalErosionLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only",  format: "rgba32float", viewDimension: "2d" } }, // terrain_in
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only",  format: "rgba32float", viewDimension: "2d" } }, // water_in
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }, // terrain_out
            { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // StillWaterParams
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }  // ThermalParams
        ]
    });

    // Margolus Binary Water Redistribution (final pass)
    const margolusBinaryWaterRedistributionLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, // MargolusParams
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba32float' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba32float' } },
            { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float' } },
            { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, // StillWaterParams
        ]
    });

    return {
        fBmSimplexNoiseLayout,
        jfaLayout,
        blendLayout,
        erosionPingPongFD8Layout,
        stillWaterRedistributionLayout,
        thermalErosionLayout,
        margolusBinaryWaterRedistributionLayout,
    };
}