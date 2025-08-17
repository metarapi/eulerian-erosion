export function renderFloatMapToCanvas(canvas, data, sizeX, sizeY, color = 'gray') {
    canvas.width = sizeX;
    canvas.height = sizeY;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(sizeX, sizeY);
    const pixelData = imageData.data;

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (!Number.isFinite(v)) continue;
        min = Math.min(min, v);
        max = Math.max(max, v);
    }
    const range = (max - min) || 1;

    for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - min) / range;
        let r = 0, g = 0, b = 0;
        const value = Math.floor(norm * 255);

        if (color === 'gray') {
            r = g = b = value;
        } else if (color === 'blue') {
            b = value;
        } else if (color === 'cyan') {
            g = b = value;
        } else if (color === 'red') {
            r = value;
        }
        const idx = i * 4;
        pixelData[idx] = r;
        pixelData[idx + 1] = g;
        pixelData[idx + 2] = b;
        pixelData[idx + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
}

// Render the four single-resolution canvases if their data is provided.
// fields: { height?, flowingWater?, stillWater?, sediment? }
export function renderSingleResolutionGrid(fields, sizeX, sizeY) {
    const h = document.getElementById('heightCanvas');
    const fw = document.getElementById('flowingWaterCanvas');
    const sw = document.getElementById('stillWaterCanvas');
    const sd = document.getElementById('sedimentCanvas');

    if (h && fields.height) renderFloatMapToCanvas(h, fields.height, sizeX, sizeY, 'gray');
    if (fw && fields.flowingWater) renderFloatMapToCanvas(fw, fields.flowingWater, sizeX, sizeY, 'blue');
    if (sw && fields.stillWater) renderFloatMapToCanvas(sw, fields.stillWater, sizeX, sizeY, 'cyan');
    if (sd && fields.sediment) renderFloatMapToCanvas(sd, fields.sediment, sizeX, sizeY, 'red');
}

// Convenience: render height + water (if you only have one water field)
export function renderHeightAndWaterFourCanvases(height, water, sizeX, sizeY) {
    renderSingleResolutionGrid(
        { height, flowingWater: water, stillWater: water },
        sizeX, sizeY
    );
}

