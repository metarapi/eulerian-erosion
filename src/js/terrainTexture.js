// Import necessary Babylon.js modules
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/**
 * Save a Uint8Array RGBA texture as a PNG file using a canvas
 * @param {Uint8Array} textureData - The RGBA texture data
 * @param {number} width - Texture width
 * @param {number} height - Texture height
 * @param {string} filename - Desired filename
 */
export function saveTextureAsPNG(textureData, width, height, filename = 'terrain_texture.png') {
    // Create a canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Create ImageData from textureData
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(textureData);
    ctx.putImageData(imageData, 0, 0);

    // Convert canvas to PNG and trigger download
    canvas.toBlob(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, 'image/png');
}

/**
 * Loads a 2D LUT from a JSON file 
 * @param {string} lutPath - Path to the LUT JSON file
 * @returns {Promise<Object>} - The loaded LUT data in flattened format
 *   { data: Uint8Array, width: number, height: number, channels: 3 }
 */
async function load2DLUT(lutPath) {
    try {
        const response = await fetch(lutPath);
        if (!response.ok) {
            throw new Error(`Failed to load LUT: ${response.statusText}`);
        }
        const lutArray2D = await response.json();

        // Infer dimensions from the nested array structure
        const height = lutArray2D.length;
        const width = lutArray2D[0].length;
        const channels = 3; // RGB
        
        // Create flattened Uint8Array in (x + y * width) * channels + c order
        const flat = new Uint8Array(width * height * channels);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const rgb = lutArray2D[y][x]; // Note: y comes first in JSON!
                for (let c = 0; c < channels; c++) {
                    flat[(x + y * width) * channels + c] = rgb[c];
                }
            }
        }
        
        return {
            data: flat,
            width,
            height,
            channels
        };
    } catch (error) {
        console.error('Error loading 2D LUT:', error);
        throw error;
    }
}

/**
 * Calculates the gradient magnitude of a heightmap
 * @param {Float32Array} heightData - The heightmap data
 * @param {number} width - Width of the heightmap
 * @param {number} height - Height of the heightmap
 * @returns {Float32Array} - Gradient magnitude map
 */
function calculateGradientMagnitude(heightData, width, height) {
    const gradient = new Float32Array(width * height);
    
    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            const idx = z * width + x;
            
            // Calculate x gradient using central difference
            let gx = 0;
            if (x > 0 && x < width - 1) {
                gx = (heightData[idx + 1] - heightData[idx - 1]) / 2;
            } else if (x > 0) {
                gx = heightData[idx] - heightData[idx - 1];
            } else if (x < width - 1) {
                gx = heightData[idx + 1] - heightData[idx];
            }
            
            // Calculate z gradient using central difference
            let gz = 0;
            if (z > 0 && z < height - 1) {
                gz = (heightData[(z + 1) * width + x] - heightData[(z - 1) * width + x]) / 2;
            } else if (z > 0) {
                gz = heightData[idx] - heightData[(z - 1) * width + x];
            } else if (z < height - 1) {
                gz = heightData[(z + 1) * width + x] - heightData[idx];
            }
            
            // Calculate gradient magnitude and normalize
            gradient[idx] = Math.sqrt(gx * gx + gz * gz);
        }
    }
    
    // Normalize gradient to [0,1]
    let minGrad = Infinity;
    let maxGrad = -Infinity;
    
    for (let i = 0; i < gradient.length; i++) {
        minGrad = Math.min(minGrad, gradient[i]);
        maxGrad = Math.max(maxGrad, gradient[i]);
    }
    
    const range = maxGrad - minGrad;
    if (range > 0) {
        for (let i = 0; i < gradient.length; i++) {
            gradient[i] = (gradient[i] - minGrad) / range;
        }
    }
    
    return gradient;
}

/**
 * Sample a 2D LUT with bilinear interpolation
 * @param {Uint8Array} lutData - The 2D LUT data array (flattened)
 * @param {number} lutWidth - Width of the LUT
 * @param {number} lutHeight - Height of the LUT
 * @param {number} x - X coordinate [0,1] (height)
 * @param {number} y - Y coordinate [0,1] (slope/gradient)
 * @returns {Array} - RGB color value [r,g,b]
 */
function sample2DLUT(lutData, lutWidth, lutHeight, x, y) {
    // Clamp input coordinates to [0,1]
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    
    // Convert to LUT indices
    const fx = x * (lutWidth - 1);
    const fy = y * (lutHeight - 1);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ix1 = Math.min(ix + 1, lutWidth - 1);
    const iy1 = Math.min(iy + 1, lutHeight - 1);
    const dx = fx - ix;
    const dy = fy - iy;
    
    // Indices for the 4 corners
    const idx00 = (ix + iy * lutWidth) * 3;
    const idx10 = (ix1 + iy * lutWidth) * 3;
    const idx01 = (ix + iy1 * lutWidth) * 3;
    const idx11 = (ix1 + iy1 * lutWidth) * 3;
    
    // Bilinear interpolation for each channel
    const result = [0, 0, 0];
    
    for (let c = 0; c < 3; c++) {
        const v00 = lutData[idx00 + c];
        const v10 = lutData[idx10 + c];
        const v01 = lutData[idx01 + c];
        const v11 = lutData[idx11 + c];
        const v0 = v00 * (1 - dx) + v10 * dx;
        const v1 = v01 * (1 - dx) + v11 * dx;
        result[c] = Math.round(v0 * (1 - dy) + v1 * dy);
    }
    
    return result;
}


/**
 * Generate a terrain texture based on heightmap and gradient using a 2D LUT for coloring
 * 
 * @param {Object} dataLevels - Data containing height
 * @param {Object} config - Configuration with size information
 * @param {Scene} scene - Babylon.js scene
 * @param {string} lutPath - Path to the 2D LUT JSON file
 * @param {string} waterLutPath - Path to the water LUT JSON file
 * @returns {Object} - Generated textures for the terrain { diffuseTexture, specularTexture, textureData }
 */
export async function generateTerrainTexture(data, config, scene, lutPath = '/eulerian-erosion/lut_rgb.json', waterLutPath = '/eulerian-erosion/water_lut_rgb.json') {
    // Load the 2D LUTs
    const lut = await load2DLUT(lutPath);
    const waterLut = await load2DLUT(waterLutPath);

    // Expect a simple single-resolution payload:
    // { height: Float32Array, flowingWater: Float32Array, stillWater: Float32Array }
    if (!data || !data.height || !data.flowingWater || !data.stillWater) {
        throw new Error('generateTerrainTexture: expected payload { height, flowingWater, stillWater }');
    }

    // Use single-resolution config keys
    let width = config.sizeX;
    let height = config.sizeY;

    // Validate and infer dimensions from arrays if necessary
    const expectedLen = width * height;
    const n = data.height.length;
    if (n !== expectedLen) {
        const sq = Math.sqrt(n);
        if (Number.isInteger(sq)) {
            width = sq;
            height = sq;
            console.warn(`generateTerrainTexture: inferred square size ${sq}x${sq} from data length`);
        } else {
            console.warn('generateTerrainTexture: data length does not match config.sizeX/sizeY; proceeding with config values');
        }
    }

    // Ensure typed arrays
    let heightData = data.height instanceof Float32Array ? data.height : Float32Array.from(data.height);
    let flowingWaterData = data.flowingWater instanceof Float32Array ? data.flowingWater : Float32Array.from(data.flowingWater);
    let stillWaterData = data.stillWater instanceof Float32Array ? data.stillWater : Float32Array.from(data.stillWater);

    const waterHeightFactor = config.waterHeightFactor;

    // Calculate gradient (slope) of the terrain only
    const gradientMagnitude = calculateGradientMagnitude(heightData, width, height);

    // Combine height and water data for water surface visualization
    const combinedHeightData = combineHeightAndWater(heightData, flowingWaterData, stillWaterData, waterHeightFactor);

    // Get the gradient magnitude for the combined height data (water surface slope)
    const combinedGradient = calculateGradientMagnitude(combinedHeightData, width, height);

    // Get the water depth from the flowing and still water data
    const combinedWaterDepth = combineWaterDepth(flowingWaterData, stillWaterData, waterHeightFactor);

    // Create texture buffers for diffuse and specular
    const textureData = new Uint8Array(width * height * 4); // RGBA diffuse
    const specularData = new Uint8Array(width * height * 4); // RGBA specular

    // Find min/max for height normalization (terrain only)
    let minHeight = Infinity, maxHeight = -Infinity;
    for (let i = 0; i < heightData.length; i++) {
        minHeight = Math.min(minHeight, heightData[i]);
        maxHeight = Math.max(maxHeight, heightData[i]);
    }
    const heightRange = maxHeight - minHeight || 1;

    // Find min/max for water depth normalization
    let minWaterDepth = 0; // Water depth starts at 0
    let maxWaterDepth = -Infinity;
    for (let i = 0; i < combinedWaterDepth.length; i++) {
        if (combinedWaterDepth[i] > 0) {
            maxWaterDepth = Math.max(maxWaterDepth, combinedWaterDepth[i]);
        }
    }
    // If no water found, set a small default range to avoid division by zero
    if (maxWaterDepth === -Infinity) {
        maxWaterDepth = 1.0;
    }
    const waterDepthRange = maxWaterDepth - minWaterDepth || 1;

    // Dynamic water threshold - 5% of max water depth, with a minimum threshold
    const dynamicWaterThreshold = Math.max(maxWaterDepth * 0.05, 0.001);

    // Snow threshold - adjust based on your terrain height scale
    const snowThreshold = minHeight + (heightRange * 0.8); // Top 20% of elevation gets snow consideration

    // Fill the textures using the 2D LUTs
    for (let i = 0; i < heightData.length; i++) {
        let finalColor;
        let specularIntensity = 0.01; // Base specularity for dry terrain
        
        // Check if there's significant water at this pixel
        const waterDepth = combinedWaterDepth[i];
        const hasWater = waterDepth > dynamicWaterThreshold;
        
        // Check if this is a snow area (high elevation)
        const terrainHeight = heightData[i];
        const isSnowArea = terrainHeight > snowThreshold;

        if (hasWater) {
            // Use water LUT: x = water surface gradient, y = water depth
            const normalizedWaterGradient = combinedGradient[i]; // Already normalized
            const normalizedWaterDepth = (waterDepth - minWaterDepth) / waterDepthRange;

            // Sample the water LUT
            const clamp01 = v => Math.max(0, Math.min(1, isNaN(v) ? 0 : v));
            const g = clamp01(normalizedWaterGradient);
            const d = clamp01(normalizedWaterDepth);
            
            const waterColor = sample2DLUT(waterLut.data, waterLut.width, waterLut.height, g, d);

            // Also sample terrain for blending
            const normalizedHeight = (heightData[i] - minHeight) / heightRange;
            const normalizedGradient = gradientMagnitude[i];

            const h = clamp01(normalizedHeight);
            const tg = clamp01(normalizedGradient);
            const terrainColor = sample2DLUT(lut.data, lut.width, lut.height, tg, h);
            
            // Blend water and terrain based on water depth
            // More water depth = more water influence, less terrain showing through
            const maxBlendDepth = dynamicWaterThreshold * 10; // 10x threshold for full water opacity
            const blendFactor = Math.min(waterDepth / maxBlendDepth, 1.0);
            
            finalColor = [
                Math.round(terrainColor[0] * (1 - blendFactor) + waterColor[0] * blendFactor),
                Math.round(terrainColor[1] * (1 - blendFactor) + waterColor[1] * blendFactor),
                Math.round(terrainColor[2] * (1 - blendFactor) + waterColor[2] * blendFactor)
            ];
            
            // Water is highly specular
            // Deep water = more specular, shallow water = less specular
            specularIntensity = 0.3 + (blendFactor * 0.5); // 0.3 to 0.8 range
            
        } else {
            // Gradient adjustment factor (contrast-like control for the LUT)
            const gradientContrast = 0.40; // Should just adjust the LUT itself but no time

            // Use terrain LUT: x = terrain gradient, y = terrain height
            const normalizedHeight = (heightData[i] - minHeight) / heightRange;
            let normalizedGradient = gradientMagnitude[i]; // Already normalized

            // Apply contrast adjustment to gradient
            normalizedGradient = Math.pow(normalizedGradient, gradientContrast);

            const clamp01 = v => Math.max(0, Math.min(1, isNaN(v) ? 0 : v));
            const h = clamp01(normalizedHeight);
            const g = clamp01(normalizedGradient);
            
            finalColor = sample2DLUT(lut.data, lut.width, lut.height, g, h);
            
            // Check if this is snow area for specularity
            if (isSnowArea) {
                // Snow is moderately specular - not as much as water but more than regular terrain
                const snowFactor = (terrainHeight - snowThreshold) / (maxHeight - snowThreshold);
                specularIntensity = 0.1 + (snowFactor * 0.4); // 0.1 to 0.5 range
            }
        }

        // Set the diffuse texture pixel
        textureData[i * 4] = finalColor[0];     // R
        textureData[i * 4 + 1] = finalColor[1]; // G
        textureData[i * 4 + 2] = finalColor[2]; // B
        textureData[i * 4 + 3] = 255;           // A (fully opaque)

        // Set the specular texture pixel
        // Convert specular intensity to 0-255 range and store in RGB channels
        const specularValue = Math.round(specularIntensity * 255);
        specularData[i * 4] = specularValue;     // R
        specularData[i * 4 + 1] = specularValue; // G  
        specularData[i * 4 + 2] = specularValue; // B
        specularData[i * 4 + 3] = 255;           // A (fully opaque)
    }

    // Create Babylon.js raw textures
    const diffuseTexture = new RawTexture(
        textureData,
        width,
        height,
        RawTexture.TEXTUREFORMAT_RGBA,
        scene,
        false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE
    );

    const specularTexture = new RawTexture(
        specularData,
        width,
        height,
        RawTexture.TEXTUREFORMAT_RGBA,
        scene,
        false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE
    );

    return { 
        diffuseTexture,
        specularTexture, 
        textureData 
    };
}

/**
 * Apply a terrain texture to the given mesh based on simulation data
 * @param {Mesh} mesh - The terrain mesh
 * @param {Object} dataLevels - Simulation data at different levels
 * @param {Object} config - Simulation configuration
 * @param {Scene} scene - Babylon.js scene
 * @returns {Promise<Object>} - Returns the generated textures
 */
export async function applyTerrainTexture(mesh, data, config, scene) {
    try {
        // Generate the textures (diffuse and specular) using single-resolution payload
        const { diffuseTexture, specularTexture, textureData } = await generateTerrainTexture(data, config, scene);

        // Apply the textures to the mesh
        const material = mesh.material;
        
        // Set diffuse texture
        material.diffuseTexture = diffuseTexture;
        
        // Set specular texture - this will control specularity per pixel
        material.specularTexture = specularTexture;
        
        // Base specular settings - the texture will modulate these values
        material.specularColor.set(1.0, 1.0, 1.0); // White specular color (texture controls intensity)
        material.specularPower = 64; // Higher value = sharper highlight
        
        return { diffuseTexture, specularTexture };
    } catch (error) {
        console.error('Error applying terrain texture:', error);
        throw error;
    }
}

/**
 * Adds heightData, flowingWaterData, and stillWaterData element-wise and returns the combined array.
 * @param {Float32Array} heightData
 * @param {Float32Array} flowingWaterData
 * @param {Float32Array} stillWaterData
 * @param {number} waterHeightFactor - Factor to scale water height
 * @returns {Float32Array} - Combined array
 */
export function combineHeightAndWater(heightData, flowingWaterData, stillWaterData, waterHeightFactor) {
    const length = heightData.length;
    const combined = new Float32Array(length);
    //const FLATTEN_WATER = 100.0; // This reduces the impact of water on the height map. Temporary until I find a better solution to redistribute water.
    for (let i = 0; i < length; i++) {
        // Combine height, flowing water, and still water data
        combined[i] = heightData[i] + (flowingWaterData[i] + stillWaterData[i]) * waterHeightFactor;
        //combined[i] = heightData[i] + (stillWaterData[i]) * waterHeightFactor;
    }
    return combined;
}

/**
 * Combines flowingWaterData and stillWaterData into a single water depth array.
 * @param {Float32Array} flowingWaterData
 * @param {Float32Array} stillWaterData
 * @param {number} waterHeightFactor - Factor to scale water height
 * @returns {Float32Array} - Combined water depth array
 */
function combineWaterDepth(flowingWaterData, stillWaterData, waterHeightFactor) {
    const length = flowingWaterData.length;
    const combined = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        // Depth = (flowing + still) * waterHeightFactor
        combined[i] = (flowingWaterData[i] + stillWaterData[i]) * waterHeightFactor;
        //combined[i] = (stillWaterData[i]) * waterHeightFactor;
    }
    return combined;
}