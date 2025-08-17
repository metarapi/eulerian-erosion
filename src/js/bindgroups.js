/**
 * Initialize all bind groups needed for the simplified single-resolution simulation
 * @param {GPUDevice} device
 * @param {Object} buffers
 * @param {Object} layouts
 * @returns {Object} All created bind groups
 */
export function initBindGroups(device, buffers, layouts) {
    // Noise (fBm + domain warp) → noiseTex
    const fBmSimplexNoiseBindGroup = device.createBindGroup({
        layout: layouts.fBmSimplexNoiseLayout,
        entries: [
            { binding: 0, resource: { buffer: buffers.noiseParamsBuffer } },
            { binding: 1, resource: buffers.noiseTex.createView() }
        ]
    });

    // Hydraulic Erosion (Ping -> Pong)
    // Read: terrainTexPing, waterTexPing
    // Write: terrainTexPong, waterTexPong
    const erosionBindGroup = device.createBindGroup({
        layout: layouts.erosionPingPongFD8Layout,
        entries: [
            { binding: 0, resource: { buffer: buffers.erosionParamsBuffer } },
            { binding: 1, resource: buffers.terrainTexPing.createView() },
            { binding: 2, resource: buffers.terrainTexPong.createView() },
            { binding: 3, resource: buffers.waterTexPing.createView() },
            { binding: 4, resource: buffers.waterTexPong.createView() }
        ]
    });

    // Still Water Redistribution
    // Read: terrainTexPong, waterTexPong
    // Write: waterTexPing
    const stillWaterRedistributionBindGroup = device.createBindGroup({
        layout: layouts.stillWaterRedistributionLayout,
        entries: [
            { binding: 0, resource: { buffer: buffers.stillWaterParamsBuffer } },
            { binding: 1, resource: buffers.terrainTexPong.createView() },
            { binding: 2, resource: buffers.waterTexPong.createView() },
            { binding: 3, resource: buffers.waterTexPing.createView() }
        ]
    });

    // Thermal Erosion
    // Read: terrainTexPong, waterTexPing
    // Write: terrainTexPing
    const thermalErosionBindGroup = device.createBindGroup({
        layout: layouts.thermalErosionLayout,
        entries: [
            { binding: 0, resource: buffers.terrainTexPong.createView() },
            { binding: 1, resource: buffers.waterTexPing.createView() },
            { binding: 2, resource: buffers.terrainTexPing.createView() },
            { binding: 3, resource: { buffer: buffers.stillWaterParamsBuffer } },
            { binding: 4, resource: { buffer: buffers.thermalParamsBuffer } }
        ]
    });

    // (final pass)
    // Margolus Binary Water Redistribution Ping → Pong
    // Read: terrainTexPing, waterTexPing
    // Write: waterTexPong
    const margolusBindGroup = device.createBindGroup({
        layout: layouts.margolusBinaryWaterRedistributionLayout,
        entries: [
            { binding: 0, resource: { buffer: buffers.margolusParamsBuffer } },
            { binding: 1, resource: buffers.terrainTexPing.createView() },
            { binding: 2, resource: buffers.waterTexPing.createView() },
            { binding: 3, resource: buffers.waterTexPong.createView() },
            { binding: 4, resource: { buffer: buffers.stillWaterParamsBuffer } }, // add factor
        ],
    });

    // Margolus Binary Water Redistribution Pong → Ping
    // Read: terrainTexPing, waterTexPong
    // Write: waterTexPong
    const margolusBindGroupReverse = device.createBindGroup({
        layout: layouts.margolusBinaryWaterRedistributionLayout,
        entries: [
            { binding: 0, resource: { buffer: buffers.margolusParamsBuffer } },
            { binding: 1, resource: buffers.terrainTexPing.createView() },
            { binding: 2, resource: buffers.waterTexPong.createView() },
            { binding: 3, resource: buffers.waterTexPing.createView() },
            { binding: 4, resource: { buffer: buffers.stillWaterParamsBuffer } }, // add factor
        ],
    });

    return {
        fBmSimplexNoiseBindGroup,
        erosionBindGroup,
        stillWaterRedistributionBindGroup,
        thermalErosionBindGroup,
        margolusBindGroup,
        margolusBindGroupReverse
    };
}