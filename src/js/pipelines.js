import { getShaders } from './importShaders.js';
import { createBindGroupLayouts } from './bindgroupLayouts.js';

/**
 * Initialize compute pipelines for the simplified single-resolution pipeline
 * @param {GPUDevice} device
 * @returns {Object} pipelines
 */
export async function initPipelines(device) {
    const shaders = await getShaders();
    const layouts = createBindGroupLayouts(device);

    // Shader modules
    const fBmSimplexNoiseThresholdedModule = device.createShaderModule({
        code: shaders.fBmSimplexNoiseThresholdedForJFA,
        label: 'fBmSimplexNoiseThresholdedModule'
    });
    
    const jfaWithAtomicMaxModule = device.createShaderModule({
        code: shaders.JFAwithAtomicMax,
        label: 'jfaWithAtomicMaxModule'
    });
    
    const blendWithNormalizeModule = device.createShaderModule({
        code: shaders.blendWithNormalize,
        label: 'blendWithNormalizeModule'
    });

    const erosionPingPongFD8Module = device.createShaderModule({
        code: shaders.erosionPingPongFD8,
        label: 'erosionPingPongFD8Module'
    });
    const stillWaterRedistributionModule = device.createShaderModule({
        code: shaders.stillWaterRedistribution,
        label: 'stillWaterRedistributionModule'
    });
    const thermalErosionModule = device.createShaderModule({
        code: shaders.thermalErosion,
        label: 'thermalErosionModule'
    });
    const margolusBinaryWaterRedistributionModule = device.createShaderModule({
        code: shaders.margolusBinaryWaterRedistribution,
        label: 'margolusBinaryWaterRedistributionModule'
    });

    // Pipelines
    const fBmSimplexNoiseThresholdedPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.fBmSimplexNoiseLayout] }),
        compute: { module: fBmSimplexNoiseThresholdedModule, entryPoint: 'main' }
    });

    const jfaPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.jfaLayout] }),
        compute: { module: jfaWithAtomicMaxModule, entryPoint: 'main' }
    });

    const blendPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.blendLayout] }),
        compute: { module: blendWithNormalizeModule, entryPoint: 'main' }
    });

    const erosionPingPongFD8Pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.erosionPingPongFD8Layout] }),
        compute: { module: erosionPingPongFD8Module, entryPoint: 'main' }
    });

    const stillWaterRedistributionPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.stillWaterRedistributionLayout] }),
        compute: { module: stillWaterRedistributionModule, entryPoint: 'main' }
    });

    const thermalErosionPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.thermalErosionLayout] }),
        compute: { module: thermalErosionModule, entryPoint: 'main' }
    });

    const margolusBinaryWaterRedistributionPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.margolusBinaryWaterRedistributionLayout] }),
        compute: { module: margolusBinaryWaterRedistributionModule, entryPoint: 'main' }
    });

    // Record the shader workgroup size so dispatch can derive correct group counts (WGSL uses @workgroup_size(8,8))
    margolusBinaryWaterRedistributionPipeline.workgroupSize = { x: 8, y: 8 };

    return {
        fBmSimplexNoiseThresholdedPipeline,
        jfaPipeline,
        blendPipeline,
        erosionPingPongFD8Pipeline,
        stillWaterRedistributionPipeline,
        thermalErosionPipeline,
        margolusBinaryWaterRedistributionPipeline
    };
}