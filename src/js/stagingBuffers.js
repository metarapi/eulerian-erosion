export function initStagingBuffers(device, config) {
    const bytesPerPixel = 16; // rgba32float
    const bytesPerRow = Math.ceil((config.sizeX * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * config.sizeY;

    return {
        // Aligned sizes for copyTextureToBuffer
        terrainStaging: device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        }),
        waterStaging: device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        })
    };
}