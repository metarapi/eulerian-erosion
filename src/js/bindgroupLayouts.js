/**
 * Creates all bind group layouts needed for the simulation.
 * @param {GPUDevice} device
 * @returns {Object} All created bind group layouts
 */
export function createBindGroupLayouts(device) {
    // fBm Simplex Noise (with domain warp)
    const fBmSimplexNoiseLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } }
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
        erosionPingPongFD8Layout,
        stillWaterRedistributionLayout,
        thermalErosionLayout,
        margolusBinaryWaterRedistributionLayout,
    };
}