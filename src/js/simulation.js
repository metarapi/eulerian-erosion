import { extractTerrainAndWaterData } from './util.js';

/**
 * Runs the new single-resolution pipeline:
 * 1) Generate noise (domain-warped fBm) → noiseTex
 * 2) Copy noiseTex → terrainTexPing
 * 3) For i in iterations: Erosion → Redistribution → Thermal
 * 4) Final Margolus passes (4 sub-iterations per pass, with offsets)
 * 5) Readback terrain (Ping) and water (Ping) to staging
 */
export async function executeErosionSimulation(device, simulationState, config) {
    const { pipelines, bindGroups, buffers, stagingBuffers } = simulationState;
    const WORKGROUP_SIZE = 16;
    // Margolus shader uses @workgroup_size(8,8)
    const MARGOLUS_WG_X = (pipelines.margolusBinaryWaterRedistributionPipeline.workgroupSize?.x) ?? 8;
    const MARGOLUS_WG_Y = (pipelines.margolusBinaryWaterRedistributionPipeline.workgroupSize?.y) ?? 8;

    const wgX = Math.ceil(buffers.sizeX / WORKGROUP_SIZE);
    const wgY = Math.ceil(buffers.sizeY / WORKGROUP_SIZE);

    const wgXMargolus = Math.ceil(buffers.sizeX / MARGOLUS_WG_X);
    const wgYMargolus = Math.ceil(buffers.sizeY / MARGOLUS_WG_Y);

    function dispatchCompute(encoder, pipeline, bindGroup, workgroupsX, workgroupsY, label = '') {
        const pass = encoder.beginComputePass({ label });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();
    }

    // Update noise params (HeightmapParams: sizeX, sizeY, octaves, zoom, persistence, seed, warp_factor)
    function updateNoiseParamsBuffer(device, buffer, cfg) {
        const data = new ArrayBuffer(8 * 4);
        const v = new DataView(data);
        let o = 0;
        v.setUint32(o, cfg.sizeX, true); o += 4;
        v.setUint32(o, cfg.sizeY, true); o += 4;
        v.setUint32(o, cfg.octaves, true); o += 4;
        v.setFloat32(o, cfg.zoom, true); o += 4;
        v.setFloat32(o, cfg.persistence, true); o += 4;
        v.setFloat32(o, cfg.seed, true); o += 4;
        v.setFloat32(o, cfg.warpFactor, true); o += 4;
        // pad 4 bytes
        device.queue.writeBuffer(buffer, 0, data);
    }

    // Update only the iteration field inside ErosionParams (offset 8 bytes)
    function updateErosionIteration(device, buffer, iteration, maxIterations) {
        // iteration @ byte 8, max_iterations @ byte 12
        const u32 = new Uint32Array([iteration, maxIterations >>> 0]);
        device.queue.writeBuffer(buffer, 8, u32);
    }

    // Helper to copy storage texture A → B
    function copyStorageTextureToTexture(encoder, srcTex, dstTex, w, h) {
        encoder.copyTextureToTexture(
            { texture: srcTex },
            { texture: dstTex },
            { width: w, height: h, depthOrArrayLayers: 1 }
        );
    }

    // 1) Generate noise into noiseTex
    updateNoiseParamsBuffer(device, buffers.noiseParamsBuffer, config);
    {
        const encoder = device.createCommandEncoder({ label: 'NoiseGen' });
        dispatchCompute(
            encoder,
            pipelines.fBmSimplexNoisePipeline,
            bindGroups.fBmSimplexNoiseBindGroup,
            wgX, wgY,
            'fBmSimplexNoiseWithDomainWarp'
        );
        device.queue.submit([encoder.finish()]);
    }

    // 2) Copy noise → terrain ping
    {
        const encoder = device.createCommandEncoder({ label: 'CopyNoiseToTerrainPing' });
        copyStorageTextureToTexture(encoder, buffers.noiseTex, buffers.terrainTexPing, buffers.sizeX, buffers.sizeY);
        device.queue.submit([encoder.finish()]);
    }

    // Optional: clear water ping/pong to zeros (safe init)
    // If your textures aren’t zero-initialized by the runtime, uncomment this block.
    // {
    //     const bytesPerPixel = 16; // rgba32float
    //     const unaligned = buffers.sizeX * bytesPerPixel;
    //     const bytesPerRow = Math.ceil(unaligned / 256) * 256;
    //     const zero = new Uint8Array(bytesPerRow * buffers.sizeY);
    //     device.queue.writeTexture({ texture: buffers.waterTexPing }, zero, { bytesPerRow, rowsPerImage: buffers.sizeY }, { width: buffers.sizeX, height: buffers.sizeY, depthOrArrayLayers: 1 });
    //     device.queue.writeTexture({ texture: buffers.waterTexPong }, zero, { bytesPerRow, rowsPerImage: buffers.sizeY }, { width: buffers.sizeX, height: buffers.sizeY, depthOrArrayLayers: 1 });
    // }

    // 3) Erosion loop: Hydraulic → Still-water redistribution → Thermal
    for (let i = 0; i < buffers.iterations; i++) {
        updateErosionIteration(device, buffers.erosionParamsBuffer, i, buffers.iterations);

        const encoder = device.createCommandEncoder({ label: `ErosionStep_${i}` });

        // Step 1: Hydraulic erosion (Ping -> Pong)
        dispatchCompute(
            encoder,
            pipelines.erosionPingPongFD8Pipeline,
            bindGroups.erosionBindGroup,
            wgX, wgY,
            'ErosionPingPongFD8'
        );

        // Step 2: Still water redistribution (Terrain Pong + Water Pong -> Water Ping)
        dispatchCompute(
            encoder,
            pipelines.stillWaterRedistributionPipeline,
            bindGroups.stillWaterRedistributionBindGroup,
            wgX, wgY,
            'StillWaterRedistribution'
        );

        // Step 3: Thermal erosion (Terrain Pong + Water Ping -> Terrain Ping)
        dispatchCompute(
            encoder,
            pipelines.thermalErosionPipeline,
            bindGroups.thermalErosionBindGroup,
            wgX, wgY,
            'ThermalErosion'
        );

        device.queue.submit([encoder.finish()]);
    }

    // 4) Final Margolus passes (replace gaussian smoothing)
    // For each pass, run 4 sub-iterations toggling offsets:
    // (0,0) → (1,0) → (0,1) → (1,1)
    // Initialize Margolus params: [size_x, size_y, offset_x, offset_y, num_iterations, pad, pad, pad]
    {
        const numIter = (buffers.margolusBinarySearchIterations ?? config.margolusBinarySearchIterations ?? 8) >>> 0;
        const u32 = new Uint32Array(8);
        u32[0] = buffers.sizeX >>> 0;
        u32[1] = buffers.sizeY >>> 0;
        u32[2] = 0; // offset_x (updated below)
        u32[3] = 0; // offset_y (updated below)
        u32[4] = numIter; // num_iterations
        // u32[5..7] padding
        device.queue.writeBuffer(buffers.margolusParamsBuffer, 0, u32);
    }

    // 4) Final Margolus passes ...
    const offsets = [[0,0],[1,0],[0,1],[1,1]];
    let currIsPing = true;
    const numIter = (buffers.margolusBinarySearchIterations ?? config.margolusBinarySearchIterations ?? 8) >>> 0;

    for (let p = 0; p < buffers.margolusPasses; p++) {
        for (const [ox, oy] of offsets) {
            const u32 = new Uint32Array(8);
            u32[0] = buffers.sizeX >>> 0;
            u32[1] = buffers.sizeY >>> 0;
            u32[2] = ox >>> 0;
            u32[3] = oy >>> 0;
            u32[4] = numIter;
            device.queue.writeBuffer(buffers.margolusParamsBuffer, 0, u32);

            const encoder = device.createCommandEncoder({ label: `MargolusPass_${p}_o${ox}${oy}` });

            // Preserve non-participating cells (checkerboard update)
            if (currIsPing) {
                encoder.copyTextureToTexture(
                    { texture: buffers.waterTexPing },
                    { texture: buffers.waterTexPong },
                    { width: buffers.sizeX, height: buffers.sizeY, depthOrArrayLayers: 1 }
                );
            } else {
                encoder.copyTextureToTexture(
                    { texture: buffers.waterTexPong },
                    { texture: buffers.waterTexPing },
                    { width: buffers.sizeX, height: buffers.sizeY, depthOrArrayLayers: 1 }
                );
            }

            const chosenBind = currIsPing ? bindGroups.margolusBindGroup : bindGroups.margolusBindGroupReverse;

            dispatchCompute(
                encoder,
                pipelines.margolusBinaryWaterRedistributionPipeline,
                chosenBind,
                wgXMargolus, wgYMargolus,
                'MargolusBinaryWaterRedistribution'
            );

            device.queue.submit([encoder.finish()]);
            currIsPing = !currIsPing;
        }
    }
    
    // Ensure final water result ends up in waterTexPing
    if (!currIsPing) {
        const encoder = device.createCommandEncoder({ label: 'Margolus_Final_Copy_Pong_to_Ping' });
        encoder.copyTextureToTexture(
            { texture: buffers.waterTexPong },
            { texture: buffers.waterTexPing },
            { width: buffers.sizeX, height: buffers.sizeY, depthOrArrayLayers: 1 }
        );
        device.queue.submit([encoder.finish()]);
        currIsPing = true;
    }

    // 5) Copy final results to staging (terrain: Ping, water: Ping after Margolus copy-back)
    const bytesPerPixel = 16; // rgba32float
    const bytesPerRowAligned = Math.ceil((buffers.sizeX * bytesPerPixel) / 256) * 256;

    {
        const encoder = device.createCommandEncoder({ label: 'CopyTexturesToStaging' });

        // Terrain is in Ping (thermal wrote Ping last)
        encoder.copyTextureToBuffer(
            { texture: buffers.terrainTexPing },
            { buffer: stagingBuffers.terrainStaging, bytesPerRow: bytesPerRowAligned },
            { width: buffers.sizeX, height: buffers.sizeY, depthOrArrayLayers: 1 }
        );

        // Water is in Ping (after Margolus copy-back)
        encoder.copyTextureToBuffer(
            { texture: buffers.waterTexPing },
            { buffer: stagingBuffers.waterStaging, bytesPerRow: bytesPerRowAligned },
            { width: buffers.sizeX, height: buffers.sizeY, depthOrArrayLayers: 1 }
        );

        device.queue.submit([encoder.finish()]);
    }

    // Read back
    await stagingBuffers.terrainStaging.mapAsync(GPUMapMode.READ);
    await stagingBuffers.waterStaging.mapAsync(GPUMapMode.READ);

    const data = extractTerrainAndWaterData(
        stagingBuffers.terrainStaging,
        stagingBuffers.waterStaging,
        buffers.sizeX,
        buffers.sizeY
    );

    stagingBuffers.terrainStaging.unmap();
    stagingBuffers.waterStaging.unmap();

    return data;
}