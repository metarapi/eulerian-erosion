import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from '@babylonjs/core';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { applyTerrainTexture } from './terrainTexture.js';
import { combineHeightAndWater } from './terrainTexture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';


let engine = null;
let scene = null;
let mesh = null;
let initialized = false;
let dataLevels = null;

export async function initializeScene(heightData, flowingWater, stillWater, width, height, currentHeightFactor, fullDataLevels = null, simulationConfig = null) {
    const canvas = document.getElementById('mainCanvas');

    // Store the data levels if provided
    if (fullDataLevels) {
        dataLevels = fullDataLevels;
    }

    if (!initialized) {
        engine = await WebGPUEngine.CreateAsync(canvas, {
            antialiasing: true,
            adaptToDeviceRatio: true,
        });
    
        scene = new Scene(engine);
        scene.createDefaultCamera(true, true, true);

        const camera = scene.activeCamera;
        camera.position = new Vector3(-10, 5, -50);
        camera.target = new Vector3(0, 0, 0);

        const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene); // Direction: straight up
        hemi.diffuse = new Color3(0.95, 0.97, 1.00); // Slightly cool/blueish (sky light)
        hemi.specular = new Color3(0.95, 0.97, 1.00); // Match diffuse for consistency
        hemi.groundColor = new Color3(0.5, 0.5, 0.5); // Optional: darker ground bounce
        hemi.intensity = 0.4;

        const dirLight = new DirectionalLight("dir", new Vector3(-1, -1, -0.5), scene); // Diagonal top-left
        dirLight.diffuse = new Color3(1.0, 0.98, 0.95); // Warm sunlight (slightly yellow)
        dirLight.specular = new Color3(1.0, 0.98, 0.95); // Match diffuse
        dirLight.intensity = 0.6;
        dirLight.shadowEnabled = false; // Enable shadows if needed

        // // Debug
        // const ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100, subdivisions: 50 }, scene);
        // ground.position.y = 0;
        // const groundMaterial = new StandardMaterial("groundMat", scene);
        // groundMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
        // groundMaterial.wireframe = true;
        // ground.material = groundMaterial;
        // ground.material.backFaceCulling = false;
        // ground.material.backFaceCulling = false;

        // Combine height, flowing water, and still water data
        const combinedHeightData = combineHeightAndWater(heightData, flowingWater, stillWater, currentHeightFactor);

        mesh = createHeightmapMesh("terrain", scene, combinedHeightData, width, height);

        const material = new StandardMaterial("mat", scene);
        material.diffuseColor.set(1, 1, 1); // Ensure white, so texture is not tinted
        mesh.material = material;
        mesh.material.wireframe = false;
        mesh.material.backFaceCulling = false; // For debugging, show both sides

        engine.runRenderLoop(() => scene.render());
        window.addEventListener('resize', () => engine.resize());

        // Set alpha, beta, radius, and target
        camera.alpha = -7.071943616229858;
        camera.beta = 0.912091238834417;
        camera.radius = 36.37108351347181;
        camera.target = new Vector3(0, 0, 0);

        // Apply texture if we have data levels and config
        if (simulationConfig) {
            const simplePayload = { height: heightData, flowingWater, stillWater };
            const tex = await applyTerrainTexture(mesh, simplePayload, simulationConfig, scene);
            // Debug: log first few texture pixel values (if available)
            if (tex && tex.textureData) {
                console.log("First 16 texture RGBA values:", tex.textureData.slice(0, 16 * 4));
            }
        }

        initialized = true;
    } else {
        const combinedHeightData = combineHeightAndWater(heightData, flowingWater, stillWater, currentHeightFactor);
        // Update mesh geometry in-place
        updateHeightmapMesh(mesh, combinedHeightData, width, height);

        // Update texture if we have data levels and config
        if (simulationConfig) {
            const simplePayload = { height: heightData, flowingWater, stillWater };
            await applyTerrainTexture(mesh, simplePayload, simulationConfig, scene);
        }
    }
}

function createHeightmapMesh(name, scene, heightData, width, height, heightScale = 5, heightOffset = 4) {
    const mesh = new Mesh(name, scene);
    updateHeightmapMesh(mesh, heightData, width, height, heightScale, heightOffset);
    return mesh;
}

function updateHeightmapMesh(mesh, heightData, width, height, heightScale = 5, heightOffset = 4) {
    const positions = [];
    const indices = [];
    const normals = [];
    const uvs = [];
    let dx, dz;
    if (width === 256) {
        dx = 0.1;
        dz = 0.1;
    } else if (width === 512) {
        dx = 0.05;
        dz = 0.05;
    } else if (width === 1024) {
        dx = 0.025;
        dz = 0.025;
    } else if (width === 2048) {
        dx = 0.0125;
        dz = 0.0125;
    } else {
        dx = 1;
        dz = 1;
    }

    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            const y = heightData[z * width + x] * heightScale + heightOffset;
            const centerX = (width - 1) / 2;
            const centerZ = (height - 1) / 2;
            positions.push(
                (x - centerX) * dx,
                y,
                ((height - 1 - z) - centerZ) * dz
            );
            uvs.push(x / (width - 1), z / (height - 1));
        }
    }

    for (let z = 0; z < height - 1; z++) {
        for (let x = 0; x < width - 1; x++) {
            const i0 = z * width + x;
            const i1 = i0 + 1;
            const i2 = i0 + width;
            const i3 = i2 + 1;
            indices.push(i0, i2, i1);
            indices.push(i1, i2, i3);
        }
    }

    VertexData.ComputeNormals(positions, indices, normals);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;

    vertexData.applyToMesh(mesh, true);
}

// /**
//  * Adds heightData, flowingWaterData, and stillWaterData element-wise and returns the combined array.
//  * @param {Float32Array} heightData
//  * @param {Float32Array} flowingWaterData
//  * @param {Float32Array} stillWaterData
//  * @param {number} waterHeightFactor - Factor to scale water height
//  * @returns {Float32Array} - Combined array
//  */
// function combineHeightAndWater(heightData, flowingWaterData, stillWaterData, waterHeightFactor) {
//     const length = heightData.length;
//     const combined = new Float32Array(length);
//     const FLATTEN_WATER = 0.1; // This reduces the impact of water on the height map. Temporary until I find a better solution to redistribute water.
//     for (let i = 0; i < length; i++) {
//         // Combine height, flowing water, and still water data
//         combined[i] = heightData[i] + (flowingWaterData[i] + stillWaterData[i]) * waterHeightFactor * FLATTEN_WATER;
//     }
//     return combined;
// }