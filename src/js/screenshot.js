import { getBabylonEngine, getBabylonScene } from './scene.js';
import { Tools } from '@babylonjs/core/Misc/tools';

/**
 * Save the current 3D scene as a PNG file using Babylon.js Tools
 * @param {number} width - Screenshot width (default: 1920)
 * @param {number} height - Screenshot height (default: 1080)
 * @param {string} filenamePrefix - Prefix for the filename (default: 'terrain')
 */
export function saveCanvasAsPNG(width = 1920, height = 1080, filenamePrefix = 'terrain') {
    const engine = getBabylonEngine();
    const scene = getBabylonScene();
    
    if (!engine || !scene || !scene.activeCamera) {
        alert('No 3D scene available to save. Please run a simulation first.');
        return;
    }

    try {
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${filenamePrefix}-${timestamp}.png`;
        
        // Set the filename for the automatic download
        // Babylon.js Tools will automatically use this filename
        Tools.ScreenshotFilename = filename;
        
        // Use the official simple pattern - no callback needed
        Tools.CreateScreenshot(
            engine,
            scene.activeCamera,
            { 
                width: width,
                height: height,
                precision: 1.0 // High quality
            }
        );
        
        console.log(`Screenshot will be saved as ${filename}`);
        
    } catch (error) {
        console.error('Failed to save screenshot:', error);
        alert('Failed to save screenshot. Please try again.');
    }
}