// Constants
const MAX_WATER_PER_CELL: f32 = 1.0;  // Maximum water volume per cell
const INV_SQRT2: f32 = 0.7071067811865475; // 1/sqrt(2)

// Clockwise starting from top-left
const NEIGHBOR_OFFSETS: array<vec2<i32>, 8> = array<vec2<i32>, 8>(
    vec2<i32>(-1, 1),   // 0 - Northwest
    vec2<i32>(0, 1),    // 1 - North
    vec2<i32>(1, 1),    // 2 - Northeast
    vec2<i32>(1, 0),    // 3 - East
    vec2<i32>(1, -1),   // 4 - Southeast
    vec2<i32>(0, -1),   // 5 - South
    vec2<i32>(-1, -1),  // 6 - Southwest
    vec2<i32>(-1, 0)    // 7 - West
);

const NEIGHBOR_INV_DISTANCES: array<f32, 8> = array<f32, 8>(
    INV_SQRT2,  // 0 - NW
    1.0,        // 1 - N
    INV_SQRT2,  // 2 - NE
    1.0,        // 3 - E
    INV_SQRT2,  // 4 - SE
    1.0,        // 5 - S
    INV_SQRT2,  // 6 - SW
    1.0         // 7 - W
);

// Uniform parameters for erosion
struct ErosionParams {
    size_x: u32,
    size_y: u32,
    iteration: u32,
    max_iterations: u32,
    spawn_cycles: u32,
    deposition_rate: f32,
    evap_rate: f32,
    water_height_factor: f32,
    still_water_relaxation: f32,
    spawn_density: f32,
    random_seed: u32,
    flow_depth_weight: f32, // default(0.25)
    shear_shallow: f32,     // default(5e-7)    
    shear_deep: f32         // default(5e-6)
}

// Bind the textures and parameters
@group(0) @binding(0) var<uniform> params: ErosionParams;
@group(0) @binding(1) var terrain_input_tex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var terrain_output_tex: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var water_input_tex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(4) var water_output_tex: texture_storage_2d<rgba32float, write>;

// PCG2D hash function for high-quality pseudo-random number generation
fn pcg2d(p: vec2<u32>) -> vec2<u32> {
    var v = p * 1664525u + 1013904223u;
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v ^= v >> vec2<u32>(16u);
    v.x += v.y * 1664525u; v.y += v.x * 1664525u;
    v ^= v >> vec2<u32>(16u);
    return v;
}

// Convert PCG hash to normalized float in [0,1) range
fn hash_to_float(hash: u32) -> f32 {
    return f32(hash) / f32(0xFFFFFFFFu);
}

// Check if coordinates are out of bounds
fn is_out_of_bounds(pos: vec2<i32>, dim_x: u32, dim_y: u32) -> bool {
    return pos.x < 0 || pos.x >= i32(dim_x) || pos.y < 0 || pos.y >= i32(dim_y);
}

// Helper functions to access data from textures
fn get_terrain_height(pos: vec2<i32>) -> f32 {
    if (is_out_of_bounds(pos, params.size_x, params.size_y)) {
        return 9999.0; // It's over 9000! (to prevent flow for out-of-bounds)
        // return 0.0;
    }
    return textureLoad(terrain_input_tex, pos).r;
}

fn get_water_data(pos: vec2<i32>) -> vec4<f32> {
    if (is_out_of_bounds(pos, params.size_x, params.size_y)) {
        return vec4<f32>(0.0);
    }
    return textureLoad(water_input_tex, pos);
}

fn get_effective_height(pos: vec2<i32>) -> f32 {
    if (is_out_of_bounds(pos, params.size_x, params.size_y)) {
        return 9999.0; // It's over 9000! (to prevent flow for out-of-bounds)
    }
    let t = get_terrain_height(pos);
    let w = get_water_data(pos);
    // Still water fully and only a fraction of flowing to stabilize routing
    let total_water = w.b + params.flow_depth_weight * w.r;
    return t + total_water * params.water_height_factor;
}

// Valleyness from Laplacian of surface used for flow (terrain + still)
// Based on FD8-Quinn (adaptive exponent)
// Laplacian → curvature sign → “valleyness” → interpolate p between two limits → use that p in FD8 slope^p weighting
// Note to self: Don't try to be smart and use a 9 point Laplacian stencil!
fn laplacian_effective_height(p: vec2<i32>) -> f32 {
    let c = get_effective_height(p);
    var sum4 = 0.0;
    let npos = array<vec2<i32>,4>(
        p + vec2<i32>(0, 1), p + vec2<i32>(1, 0),
        p + vec2<i32>(0,-1), p + vec2<i32>(-1,0)
    );
    for (var k = 0; k < 4; k++) {
        if (!is_out_of_bounds(npos[k], params.size_x, params.size_y)) {
            sum4 += get_effective_height(npos[k]);
        } else {
            sum4 += c;
        }
    }
    // Discrete Laplacian
    return sum4 - 4.0 * c;
}

// Calculate normalized flow weights to downhill neighbors
fn compute_normalized_flow_weights(pos: vec2<i32>) -> array<f32, 8> {

    // Compute adaptive exponent p: <1 spreads on hillslopes; >1 concentrates in valleys
    // These are empirical factors obtained from measurement of real terrains (Quinn 1995)
    // You can also scale these to 2 to 20 or change the sign
    let lap = laplacian_effective_height(pos);          // curvature proxy
    let valleyness = clamp(-lap * 50.0, 0.0, 1.0);      // ≈ “scaled curvature” ≈ proxy for α influence.
    let p = mix(0.8, 2.5, valleyness);                  // 0.8 ≈ low-convergence p (ridges/slopes). 2.5 ≈ high-convergence p (valleys).
    // let p = mix(2.0, 20.0, valleyness);              // No idea which values are "correct" 

    var weights: array<f32, 8>;
    var total_weight: f32 = 0.0;
    // let current_height = get_terrain_height(pos);
    let current_height = get_effective_height(pos);

    for (var i = 0; i < 8; i++) {
        let offset = NEIGHBOR_OFFSETS[i];
        let neighbor_pos = pos + offset;

        if (is_out_of_bounds(neighbor_pos, params.size_x, params.size_y)) {
            weights[i] = 0.0;
            continue;
        }

        // let neighbor_height = get_terrain_height(neighbor_pos);
        let neighbor_height = get_effective_height(neighbor_pos);
        let height_diff = current_height - neighbor_height;

        if (height_diff <= 0.0) {
            weights[i] = 0.0;
            continue;
        }

        let inv_distance = NEIGHBOR_INV_DISTANCES[i];
        let slope = height_diff * inv_distance;

        let w = pow(max(slope, 1e-8), p);  // FD8-Quinn style exponent

        //weights[i] = slope;
        //total_weight += slope;
        weights[i] = w;
        total_weight += w;
    }

    // Normalize weights
    if (total_weight > 0.0) {
        for (var i = 0; i < 8; i++) {
            weights[i] = weights[i] / total_weight;
        }
    } else {
        for (var i = 0; i < 8; i++) {
            weights[i] = 0.0;
        }
    }

    return weights;
}

// Helper to accumulate water and sediment from neighbors (pure transport)
fn accumulate_water_and_sediment(pos: vec2<i32>) -> vec2<f32> {
    
    var water_accumulator: f32 = 0.0;
    var sediment_accumulator: f32 = 0.0;
    let current_height = get_effective_height(pos);

    for (var i = 0; i < 8; i++) {
        let offset = NEIGHBOR_OFFSETS[i];
        let neighbor_pos = pos + offset;
        
        if (is_out_of_bounds(neighbor_pos, params.size_x, params.size_y)) {
            continue;
        }
        
        // let neighbor_height = get_terrain_height(neighbor_pos);
        let neighbor_height = get_effective_height(neighbor_pos);
        let neighbor_water = get_water_data(neighbor_pos);
        let neighbor_flowing_water = neighbor_water.r;
        let neighbor_flowing_sediment = neighbor_water.g;
        
        // Skip if the neighbor has no water or isn't higher than current cell
        if (neighbor_flowing_water <= 0.0 || neighbor_height <= current_height) {
            continue;
        }
        
        // Calculate how much water flows from this neighbor to current cell
        let neighbor_weights = compute_normalized_flow_weights(neighbor_pos);
        let my_index = (i + 4) % 8;  // Get opposite direction index
        let flow_fraction = neighbor_weights[my_index];
        
        // If there's flow to current cell
        if (flow_fraction > 0.0) {
            let incoming_water = neighbor_flowing_water * flow_fraction;
            water_accumulator += incoming_water;

            // Transport sediment unchanged here (no bed exchange in gather)
            let incoming_sediment = neighbor_flowing_sediment * flow_fraction;
            sediment_accumulator += incoming_sediment;
        }
    }
       
    return vec2<f32>(water_accumulator, sediment_accumulator);
}

fn should_spawn_droplet(pos: vec2<i32>) -> bool {
    if (params.iteration >= params.spawn_cycles) {
        return false;
    }
    
    let seed_pos = vec2<u32>(u32(pos.x), u32(pos.y)) + vec2<u32>(params.random_seed, params.iteration);
    let random_val = hash_to_float(pcg2d(seed_pos).x);
    
    return random_val < params.spawn_density;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pos = vec2<i32>(i32(global_id.x), i32(global_id.y));

    // Early exit if outside dimensions
    if (pos.x >= i32(params.size_x) || pos.y >= i32(params.size_y)) {
        return;
    }

    // Read current data
    let terrain_data = textureLoad(terrain_input_tex, pos);
    let water_data = textureLoad(water_input_tex, pos);

    let current_height = terrain_data.r;
    let current_flowing_water = water_data.r;
    let current_flowing_sediment = water_data.g;
    let current_still_water = water_data.b;
    let current_still_sediment = water_data.a;

    // Initialize next state
    var next_height = current_height;
    var next_flowing_water = 0.0;        // Reset flowing water
    var next_flowing_sediment = 0.0;     // Reset flowing sediment
    var next_still_water = current_still_water;        // Still water persists
    var next_still_sediment = current_still_sediment;  // Still sediment persists

    // Flow routing weights
    let flow_weights = compute_normalized_flow_weights(pos);
    var total_flow_weight = 0.0;
    for (var i = 0; i < 8; i++) {
        total_flow_weight += flow_weights[i];
    }

    // Remobilization from still -> flowing when there is a downslope path
    var remobilized_water = 0.0;
    var remobilized_sediment = 0.0;
    if (current_still_water > 0.0 && total_flow_weight > 0.0) {
        let actual_remobilize = min(current_still_water * params.still_water_relaxation, MAX_WATER_PER_CELL);
        next_still_water -= actual_remobilize;
        remobilized_water = actual_remobilize;

        if (current_still_water > 0.0) {
            let sediment_fraction = actual_remobilize / current_still_water;
            remobilized_sediment = current_still_sediment * sediment_fraction;
            next_still_sediment -= remobilized_sediment;
        }
    }

    // Pit handling: deposit proportionally from both pools; move remaining flowing sediment to still; demobilize flowing water
    if (total_flow_weight <= 0.0 && current_flowing_water > 0.0) {
        let total_sed = current_flowing_sediment + current_still_sediment;
        if (total_sed > 0.0) {
            let amount_to_deposit = total_sed * params.deposition_rate;
            let flow_share = current_flowing_sediment / total_sed;
            let dep_flow = amount_to_deposit * flow_share;
            let dep_still = amount_to_deposit - dep_flow;

            next_height += amount_to_deposit;

            let flow_after = max(0.0, current_flowing_sediment - dep_flow);
            let still_after = max(0.0, current_still_sediment - dep_still);

            // Remaining flowing sediment joins still pool (since water is demobilized)
            next_still_sediment = still_after + flow_after;
        }

        // Convert flowing water to still water with single evaporation
        let demobilized_water = current_flowing_water * (1.0 - params.evap_rate);
        next_still_water += demobilized_water;
    }

    // Inflow to the current cell (pure transport gather); apply single evaporation to inflow only
    let accumulation = accumulate_water_and_sediment(pos);
    var water_accumulator = (accumulation.x * (1.0 - params.evap_rate)) + remobilized_water;
    var sediment_accumulator = accumulation.y + remobilized_sediment;

    // Mass-conservative bed exchange using gathered inflow and local slope
    if (total_flow_weight > 0.0 && water_accumulator > 0.0) {
        var avg_slope = 0.0;
        for (var i = 0; i < 8; i++) {
            if (flow_weights[i] > 0.0) {
                let neighbor_pos = pos + NEIGHBOR_OFFSETS[i];
                let dh = current_height - get_terrain_height(neighbor_pos);
                let s = max(dh * NEIGHBOR_INV_DISTANCES[i], 0.0);
                avg_slope += s * flow_weights[i];
            }
        }

        let depth_height = (current_still_water + params.flow_depth_weight * water_accumulator) * params.water_height_factor;
        let shear = depth_height * avg_slope;
        let shear_gate = smoothstep(params.shear_shallow, params.shear_deep, shear);

        let erosion_capacity = water_accumulator * avg_slope * shear_gate;

        let sdiff = erosion_capacity - sediment_accumulator;          // >0 erode; <0 deposit
        let exchange = params.deposition_rate * sdiff;

        // Mirror exchange between terrain and suspended load
        next_height -= exchange;
        sediment_accumulator += exchange;
    }

    // Spawn droplets (if enabled)
    if (should_spawn_droplet(pos)) {
        next_flowing_water += MAX_WATER_PER_CELL * 0.5;
    }

    // Cap flowing water and split sediment proportionally
    if (water_accumulator > MAX_WATER_PER_CELL) {
        let excess_water = water_accumulator - MAX_WATER_PER_CELL;
        let water_to_still_fraction = excess_water / water_accumulator;
        let sediment_to_still = sediment_accumulator * water_to_still_fraction;

        next_flowing_water    += MAX_WATER_PER_CELL;
        next_flowing_sediment += (sediment_accumulator - sediment_to_still);

        next_still_water      += excess_water;
        next_still_sediment   += sediment_to_still;
    } else {
        next_flowing_water    += water_accumulator;
        next_flowing_sediment += sediment_accumulator;
    }

    // Store results
    textureStore(terrain_output_tex, pos, vec4<f32>(
        next_height,
        terrain_data.g,
        terrain_data.b,
        terrain_data.a
    ));

    textureStore(water_output_tex, pos, vec4<f32>(
        next_flowing_water,
        next_flowing_sediment,
        next_still_water,
        next_still_sediment
    ));
}