// Simplified UI wiring: map DOM inputs -> config object, sync/reset utilities.
import { config, defaultConfig } from './config.js';
import { saveCanvasAsPNG } from './screenshot.js';

// Small helper to simulate user input (keeps Alpine/DOM in sync)
function mimicUserInput(inputElement, value) {
    if (!inputElement) return;
    inputElement.value = value;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
}

// Parse input value according to type of target config value
function parseForKey(key, raw) {
    const ref = defaultConfig[key];
    if (typeof ref === 'number' && Number.isInteger(ref)) return parseInt(raw, 10) || 0;
    return parseFloat(raw) || 0;
}

// Map of control id -> config key
const CONTROL_MAP = {
    // global
    mapSizeInput: 'mapSizeInput', // handled specially (maps to sizeX/sizeY)
    iterations: 'iterations',

    // hydraulic
    spawnCycles: 'spawnCycles',
    depositionRate: 'depositionRate',
    evapRate: 'evapRate',
    waterHeightFactor: 'waterHeightFactor',
    stillWaterRelaxation: 'stillWaterRelaxation',
    spawnDensity: 'spawnDensity',
    flowDepthWeight: 'flowDepthWeight',
    shearShallow: 'shearShallow',
    shearDeep: 'shearDeep',

    // noise (advanced)
    octaves: 'octaves',
    zoom: 'zoom',
    persistence: 'persistence',
    warpFactor: 'warpFactor',
    seed: 'seed',

    // JFA blending
    jfaThreshold: 'jfaThreshold',
    blendFactor: 'blendFactor', // special handling - maps to heightmapWeight/distanceWeight

    // thermal (advanced)
    talusWet: 'talusWet',
    talusImmersed: 'talusImmersed',
    talusLowHeight: 'talusLowHeight',
    talusHighHeight: 'talusHighHeight',
    talusDryLow: 'talusDryLow',
    talusDryHigh: 'talusDryHigh',
    flowWetMin: 'flowWetMin',
    flowWetMax: 'flowWetMax',
    immerseMinX: 'immerseMinX',
    immerseMaxX: 'immerseMaxX',
    thermalStrength: 'thermalStrength',
    thermalMaxDeltaPerPass: 'thermalMaxDeltaPerPass',

    // margolus
    margolusPasses: 'margolusPasses',
    margolusBinarySearchIterations: 'margolusBinarySearchIterations'
};

// Map size slider values -> actual size
const MAP_SIZE_TABLE = {
    0: 256,
    33: 512,
    66: 1024,
    99: 2048
};

// Helper function to update blend weights from blend factor
function updateBlendWeights(blendFactor) {
    // blendFactor: 0.0 = all heightmap, 1.0 = all distance field
    config.distanceWeight = blendFactor;
    config.heightmapWeight = 1.0 - blendFactor;
    console.debug(`Blend updated: heightmapWeight=${config.heightmapWeight.toFixed(3)}, distanceWeight=${config.distanceWeight.toFixed(3)}`);
}

// Helper function to get blend factor from current weights
function getBlendFactorFromWeights() {
    const total = config.heightmapWeight + config.distanceWeight;
    if (total <= 0) return 0.5; // fallback
    return config.distanceWeight / total;
}

function setupControls() {
    Object.keys(CONTROL_MAP).forEach(id => {
        const el = document.getElementById(id);
        if (!el) {
            // mapSizeInput handled below; it's okay if some advanced toggles are not present
            if (id !== 'mapSizeInput') console.debug(`UI: control not found: ${id}`);
            return;
        }

        // Special handling for mapSize slider
        if (id === 'mapSizeInput') {
            // initialize slider position from config.sizeX
            let startKey = 33; // default (512)
            const cur = config.sizeX || config.sizeXL1 || 512;
            for (const k of Object.keys(MAP_SIZE_TABLE)) {
                if (MAP_SIZE_TABLE[k] === cur) { startKey = Number(k); break; }
            }
            el.value = startKey;

            el.addEventListener('input', (e) => {
                const sv = parseInt(e.target.value, 10);
                const chosen = MAP_SIZE_TABLE.hasOwnProperty(sv) ? MAP_SIZE_TABLE[sv] : 1024;
                config.sizeX = chosen;
                config.sizeY = chosen;
                // If code expects legacy sizeXL1 keys, keep them for compatibility
                config.sizeXL1 = chosen;
                config.sizeYL1 = chosen;
                console.log('Map size set to', chosen);
            });
            return;
        }

        // Special handling for blend factor
        if (id === 'blendFactor') {
            // Initialize with current blend factor from weights
            const currentBlendFactor = getBlendFactorFromWeights();
            mimicUserInput(el, String(currentBlendFactor));

            el.addEventListener('input', (e) => {
                const blendFactor = parseFloat(e.target.value);
                if (Number.isFinite(blendFactor)) {
                    updateBlendWeights(blendFactor);
                }
            });
            return;
        }        

        // initialize element with current config
        const key = CONTROL_MAP[id];
        if (config.hasOwnProperty(key)) {
            mimicUserInput(el, String(config[key]));
        }

        // update config on input
        el.addEventListener('input', (e) => {
            // special: iterations and integer params
            if (id === 'iterations' || id === 'octaves' || id === 'seed' || id === 'margolusPasses' || id === 'margolusBinarySearchIterations') {
                const v = parseInt(e.target.value, 10) || 0;
                config[key] = v;
            } else {
                const v = parseFloat(e.target.value);
                config[key] = Number.isFinite(v) ? v : config[key];
            }

            // update any small UI displays (iterationsValue exists)
            if (id === 'iterations') {
                const sp = document.getElementById('iterationsValue');
                if (sp) sp.textContent = String(config.iterations);
            }

            // keep debug output concise
            // console.debug(`UI -> config: ${key} = ${config[key]}`);
        });
    });
}

function setupButtons(onRunSimulation, onResetSimulation) {
    const runBtn = document.getElementById('runSimulationBtn');
    const resetBtn = document.getElementById('resetSimulationBtn');
    const saveBtn = document.getElementById('saveCanvasBtn');

    if (runBtn) runBtn.addEventListener('click', () => { if (onRunSimulation) onRunSimulation(getConfig()); });
    if (resetBtn) resetBtn.addEventListener('click', () => {
        resetConfigToDefault();
        if (onResetSimulation) onResetSimulation();
    });

    // Add save functionality - now using imported function
    if (saveBtn) saveBtn.addEventListener('click', () => saveCanvasAsPNG());
}

function resetConfigToDefault() {
    Object.assign(config, defaultConfig);
    // restore size keys
    config.sizeX = defaultConfig.sizeX;
    config.sizeY = defaultConfig.sizeY;
    config.sizeXL1 = defaultConfig.sizeX;
    config.sizeYL1 = defaultConfig.sizeY;
    syncAllUIWithConfig();
    console.log('Config reset to defaults');
}

function syncAllUIWithConfig() {
    // sync all known controls
    Object.keys(CONTROL_MAP).forEach(id => {
        const el = document.getElementById(id);
        const key = CONTROL_MAP[id];
        if (!el) return;

        // Special handling for blend factor
        if (id === 'blendFactor') {
            const currentBlendFactor = getBlendFactorFromWeights();
            mimicUserInput(el, String(currentBlendFactor.toFixed(2)));
            return;
        }

        if (!config.hasOwnProperty(key)) return;
        mimicUserInput(el, String(config[key]));
    });

    // sync map size slider position from config.sizeX
    const mapEl = document.getElementById('mapSizeInput');
    if (mapEl) {
        const cur = config.sizeX || 512;
        let found = 33;
        for (const k of Object.keys(MAP_SIZE_TABLE)) {
            if (MAP_SIZE_TABLE[k] === cur) { found = Number(k); break; }
        }
        mimicUserInput(mapEl, String(found));
    }

    // sync iterations display
    const sp = document.getElementById('iterationsValue');
    if (sp) sp.textContent = String(config.iterations);

    console.debug('UI synced with config');
}

function getConfig() { return { ...config }; }

function updateConfig(updates) { 
    Object.assign(config, updates); 
    
    // If heightmapWeight or distanceWeight were updated, sync the blend factor slider
    if (updates.hasOwnProperty('heightmapWeight') || updates.hasOwnProperty('distanceWeight')) {
        const blendEl = document.getElementById('blendFactor');
        if (blendEl) {
            const currentBlendFactor = getBlendFactorFromWeights();
            mimicUserInput(blendEl, String(currentBlendFactor.toFixed(2)));
        }
    }
    
    syncAllUIWithConfig(); 
}

function logConfig() { console.log('config', getConfig()); }

// Initialization
function initializeConfigUI(onRunSimulation = null, onResetSimulation = null) {
    // small tolerance for DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            setupControls();
            setupButtons(onRunSimulation, onResetSimulation);
            syncAllUIWithConfig();

            // expose helpers for debugging
            window.getConfig = getConfig;
            window.updateConfig = updateConfig;
            window.logConfig = logConfig;
            window.updateBlendWeights = updateBlendWeights; // expose for debugging

            console.log('UI initialized');
        }, 50);
    });
}

// auto-init in case module loaded directly (already done in main)
// initializeConfigUI();

// exports
export {
    initializeConfigUI,
    getConfig,
    updateConfig,
    resetConfigToDefault,
    logConfig,
    updateBlendWeights
};