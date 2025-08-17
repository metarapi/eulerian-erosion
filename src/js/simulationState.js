import { initBuffers } from './buffers.js';
import { createBindGroupLayouts } from './bindgroupLayouts.js';
import { initPipelines } from './pipelines.js';
import { initBindGroups } from './bindgroups.js';
import { initStagingBuffers } from './stagingBuffers.js';
// import { config } from './config.js';

export async function createSimulationState(device, config) {
    // 1. Buffers & textures
    const buffers = await initBuffers(device, config);
    const stagingBuffers = await initStagingBuffers(device, config);

    // 2. Bind group layouts
    const layouts = createBindGroupLayouts(device);

    // 3. Pipelines (pass layouts in if needed)
    const pipelines = await initPipelines(device, layouts);

    // 4. Bind groups (pass layouts and buffers)
    const bindGroups = initBindGroups(device, buffers, layouts);

    // 5. Centralized state object
    return {
        buffers,
        stagingBuffers,
        layouts,
        pipelines,
        bindGroups
    };
}