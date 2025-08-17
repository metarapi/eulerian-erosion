import './style.css'
import "flyonui/flyonui"
import Alpine from 'alpinejs'
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { initTooltips } from './js/tooltips.js';

import { config } from './js/config.js';
import { initializeConfigUI } from './js/ui.js';
import { createSimulationState } from './js/simulationState.js';
import { executeErosionSimulation } from './js/simulation.js';
import { initWebGPU } from './js/initWebGPU.js';
import { renderSingleResolutionGrid, renderHeightAndWaterFourCanvases } from './js/display.js';
import { saveFloatMapAsCSV } from './js/util.js';
import { initializeScene } from './js/scene.js';



// Global state
let device = null;
let simulationState = null;

async function runSimulation(currentConfig = config) {
    setRunButtonLoading(true);
    try {
        console.log('Starting simulation with config:', currentConfig);
        
        // If device or simulation state don't exist, initialize them
        if (!device) {
            device = await initWebGPU();
        }
        
        // Recreate simulation state with current config
        simulationState = await createSimulationState(device, currentConfig);
        
        // Run the simulation (single-resolution)
        const data = await executeErosionSimulation(device, simulationState, currentConfig);
      
        // Render results to the four single-resolution canvases
        renderSingleResolutionGrid({
            height: data.height,
            flowingWater: data.flowingWater,
            stillWater: data.stillWater,
            sediment: data.flowingSediment
        }, currentConfig.sizeX, currentConfig.sizeY);
        
        // Initialize/Update Babylon.js scene with the height data
        await initializeScene(
            data.height,
            data.flowingWater,
            data.stillWater,
            currentConfig.sizeX,
            currentConfig.sizeY,
            currentConfig.waterHeightFactor,
            null, // no full multigrid payload
            currentConfig
        );

        console.log('Simulation completed successfully');
        
        // Optional: Save data
        // saveFloatMapAsCSV(data.stillWater, currentConfig.sizeX, currentConfig.sizeY, 'stillWater.csv');
        
    } catch (error) {
        console.error('Simulation failed:', error);
    } finally {
        setRunButtonLoading(false);
    }
}

function resetSimulation() {
    console.log('Resetting simulation...');
    
    // Clear any existing canvases or reset display
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
    
    // Reset simulation state to force recreation with new config
    simulationState = null;
    
    console.log('Simulation reset complete');
}

async function main() {
    try {
        // 0. Start Alpine
        window.Alpine = Alpine;
        Alpine.start();
        
        // 1. Initialize UI with button callbacks
        initializeConfigUI(runSimulation, resetSimulation);
        
        // 2. Initialize WebGPU
        device = await initWebGPU();
        
        // Initialize tooltips (loads templates and binds triggers)
        await initTooltips();

        // 3. Run initial simulation (this will initialize the scene)
         await runSimulation();

        // tippy('#myButton', {
        //     content: '<strong>Bolded <span class="text-brink-pink-400">content</span></strong>',
        //     allowHTML: true,
        //     placement: 'right',
        //     arrow: false,
        //     animation: 'fade',
        //     theme:'light',
        //     interactive: true,
        // });
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Application initialization failed:', error);
    }
}

// Make functions globally available for debugging
window.runSimulation = runSimulation;
window.resetSimulation = resetSimulation;

function setRunButtonLoading(isLoading) {
    const iconSpan = document.getElementById('runSimulationIcon');
    if (isLoading) {
        iconSpan.className = ''; // Remove icon
        iconSpan.classList.add('loading', 'loading-bars');
    } else {
        iconSpan.className = ''; // Remove icon
        iconSpan.classList.add('ti', 'ti-player-play', 'mr-2'); // Restore icon

    }
}

main();