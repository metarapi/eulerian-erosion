/**
 * Load HTML partial and inject it into the DOM
 * @param {string} partialPath - Path to the HTML partial file
 * @param {string} targetSelector - CSS selector where to inject the HTML
 * @returns {Promise<void>}
 */
export async function loadHTMLPartial(partialPath, targetSelector = 'body') {
    try {
        console.log(`Attempting to fetch: ${partialPath}`);
        const response = await fetch(partialPath);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        console.log(`HTML loaded, length: ${html.length} characters`);
        
        const targetElement = document.querySelector(targetSelector);
        if (targetElement) {
            targetElement.insertAdjacentHTML('beforeend', html);
            console.log(`HTML injected into ${targetSelector}`);
        } else {
            console.warn(`Target element ${targetSelector} not found`);
        }
    } catch (error) {
        console.error('Error loading HTML partial:', error);
        throw error;
    }
}

/**
 * Show a modal with custom content
 * @param {string} modalId - ID of the modal element
 * @param {Object} options - Modal configuration options
 */
export function showModal(modalId, options = {}) {
    const modal = document.getElementById(modalId);
    if (modal) {
        // Update modal content if provided
        if (options.title) {
            const titleElement = modal.querySelector('.modal-title');
            if (titleElement) titleElement.textContent = options.title;
        }
        
        if (options.body) {
            const bodyElement = modal.querySelector('.modal-body');
            if (bodyElement) bodyElement.innerHTML = options.body;
        }
        
        // Show modal
        modal.classList.remove('hidden');
        modal.classList.add('overlay-open');
    }
}

/**
 * Hide a modal
 * @param {string} modalId - ID of the modal element
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('overlay-open');
    }
}

export function extractTerrainAndWaterData(terrainBuffer, waterBuffer, sizeX, sizeY) {
    const terrainData = new Float32Array(terrainBuffer.getMappedRange());
    const waterData = new Float32Array(waterBuffer.getMappedRange());

    console.log(`Extracting terrain and water data for size ${sizeX}x${sizeY}`);

    const height = new Float32Array(sizeX * sizeY);
    const terrain_g = new Float32Array(sizeX * sizeY);
    const terrain_b = new Float32Array(sizeX * sizeY);
    const terrain_a = new Float32Array(sizeX * sizeY);

    const flowingWater = new Float32Array(sizeX * sizeY);
    const flowingSediment = new Float32Array(sizeX * sizeY);
    const stillWater = new Float32Array(sizeX * sizeY);
    const stillSediment = new Float32Array(sizeX * sizeY);

    for (let i = 0; i < sizeX * sizeY; i++) {
        // Terrain texture channels
        height[i]      = terrainData[i * 4];
        terrain_g[i]   = terrainData[i * 4 + 1];
        terrain_b[i]   = terrainData[i * 4 + 2];
        terrain_a[i]   = terrainData[i * 4 + 3];

        // Water texture channels
        flowingWater[i]    = waterData[i * 4];
        flowingSediment[i] = waterData[i * 4 + 1];
        stillWater[i]      = waterData[i * 4 + 2];
        stillSediment[i]   = waterData[i * 4 + 3];
    }

    return {
        height,
        terrain_g,
        terrain_b,
        terrain_a,
        flowingWater,
        flowingSediment,
        stillWater,
        stillSediment
    };
}

export function saveFloatMapAsCSV(data, sizeX, sizeY, filename = 'map.csv') {
    let csv = '';
    for (let y = 0; y < sizeY; y++) {
        let row = [];
        for (let x = 0; x < sizeX; x++) {
            row.push(data[y * sizeX + x]);
        }
        csv += row.join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Debug helper to extract just water data from the staging buffer
 * @param {GPUBuffer} waterStaging 
 * @param {number} sizeX 
 * @param {number} sizeY 
 * @returns {Float32Array} Just the water values
 */
export function debugExtractWaterData(waterStaging, sizeX, sizeY) {
    if (!waterStaging) return null;
    
    const mapped = waterStaging.getMappedRange();
    const f32View = new Float32Array(mapped);
    
    // Get the padded bytes per row in floats
    const bytesPerPixel = 16; // rgba32float
    const bytesPerRow = Math.ceil((sizeX * bytesPerPixel) / 256) * 256;
    const floatsPerRow = bytesPerRow / 4;
    
    // Extract just the R channel from RGBA data, which contains water depth
    const water = new Float32Array(sizeX * sizeY);
    
    for (let y = 0; y < sizeY; y++) {
        const srcRowOffset = y * floatsPerRow;
        for (let x = 0; x < sizeX; x++) {
            // For each pixel, get the R channel (first float of each RGBA)
            water[y * sizeX + x] = f32View[srcRowOffset + x * 4];
        }
    }
    
    // Calculate sum and log statistics
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let nonZeroCount = 0;
    
    for (let i = 0; i < water.length; i++) {
        const v = water[i];
        sum += v;
        if (v !== 0) {
            nonZeroCount++;
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
    }
    
    console.log(`Water stats: sum=${sum}, nonZero=${nonZeroCount}, min=${min}, max=${max}`);
    
    // Display a small sample of the data
    if (nonZeroCount > 0) {
        console.log('Sample of non-zero water values:', 
            Array.from(water).filter(v => v !== 0).slice(0, 10));
    }
    
    return water;
}