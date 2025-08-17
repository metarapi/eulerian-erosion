// Constants
const INV_SQRT2: f32 = 0.7071067811865475; // 1.0 / sqrt(2)

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
struct StillWaterParams {
    size_x: u32,
    size_y: u32,
    water_height_factor: f32,
    still_water_relaxation: f32,
}

// Bind the textures and parameters
@group(0) @binding(0) var<uniform> params: StillWaterParams;
@group(0) @binding(1) var terrain_tex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var water_input_tex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(3) var water_output_tex: texture_storage_2d<rgba32float, write>;

fn is_out_of_bounds(pos: vec2<i32>, dim_x: u32, dim_y: u32) -> bool {
    return pos.x < 0 || pos.x >= i32(dim_x) || pos.y < 0 || pos.y >= i32(dim_y);
}

// Helper functions to access data from textures
fn get_terrain_height(pos: vec2<i32>) -> f32 {
    if (is_out_of_bounds(pos, params.size_x, params.size_y)) {
        return 0.0;
    }
    return textureLoad(terrain_tex, pos).r;  // Changed from terrain_input_tex to terrain_tex
}

fn get_water_data(pos: vec2<i32>) -> vec4<f32> {
    if (is_out_of_bounds(pos, params.size_x, params.size_y)) {
        return vec4<f32>(0.0);
    }
    return textureLoad(water_input_tex, pos);
}

// Calculate normalized still water weights (considering water height)
fn compute_normalized_still_water_weights(pos: vec2<i32>) -> array<f32, 8> {
    var weights: array<f32, 8>;
    var total_weight: f32 = 0.0;
    
    let terrain_height = textureLoad(terrain_tex, pos).r;  // This is already correct
    let water_data = textureLoad(water_input_tex, pos);
    let still_water = water_data.b;
    let effective_height = terrain_height + still_water * params.water_height_factor;

    for (var i = 0; i < 8; i++) {
        let offset = NEIGHBOR_OFFSETS[i];
        let neighbor_pos = pos + offset;

        if (is_out_of_bounds(neighbor_pos, params.size_x, params.size_y)) {
            weights[i] = 0.0;
            continue;
        }

        let neighbor_terrain_height = textureLoad(terrain_tex, neighbor_pos).r;
        let neighbor_water_data = textureLoad(water_input_tex, neighbor_pos);
        let neighbor_still_water = neighbor_water_data.b;
        let neighbor_effective_height = neighbor_terrain_height + neighbor_still_water * params.water_height_factor;
        
        let height_diff = effective_height - neighbor_effective_height;

        if (height_diff <= 1e-5) {
            weights[i] = 0.0;
            continue;
        }

        let inv_distance = NEIGHBOR_INV_DISTANCES[i];
        let slope = height_diff * inv_distance;

        weights[i] = slope;
        total_weight += slope;
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

// Helper to accumulate still water and sediment
fn accumulate_still_water_and_sediment(pos: vec2<i32>) -> vec2<f32> {
    var water_accumulator: f32 = 0.0;
    var sediment_accumulator: f32 = 0.0;
    
    let terrain_height = textureLoad(terrain_tex, pos).r;
    let water_data = textureLoad(water_input_tex, pos);
    let still_water = water_data.b;
    let effective_height = terrain_height + still_water * params.water_height_factor;
    
    for (var i = 0; i < 8; i++) {
        let offset = NEIGHBOR_OFFSETS[i];
        let neighbor_pos = pos + offset;
        
        if (is_out_of_bounds(neighbor_pos, params.size_x, params.size_y)) {
            continue;
        }
        
        let neighbor_terrain_height = textureLoad(terrain_tex, neighbor_pos).r;
        let neighbor_water_data = textureLoad(water_input_tex, neighbor_pos);
        let neighbor_still_water = neighbor_water_data.b;
        let neighbor_still_sediment = neighbor_water_data.a;
        let neighbor_effective_height = neighbor_terrain_height + neighbor_still_water * params.water_height_factor;
        
        // Skip if neighbor has no still water or isn't higher than current cell
        if (neighbor_still_water <= 0.0 || neighbor_effective_height <= effective_height) {
            continue;
        }
        
        let neighbor_weights = compute_normalized_still_water_weights(neighbor_pos);
        let my_index = (i + 4) % 8;
        let flow_fraction = neighbor_weights[my_index];
        
        if (flow_fraction > 0.0) {
            let total_potential_outflow = min(
                neighbor_still_water * flow_fraction,
                params.still_water_relaxation * neighbor_still_water * flow_fraction
            );
            
            let incoming_water = total_potential_outflow;
            water_accumulator += incoming_water;
            
            // Proportional sediment transfer (concentration based)
            if (neighbor_still_water > 0.0) {
                let concentration = neighbor_still_sediment / neighbor_still_water;
                let incoming_sediment = incoming_water * concentration;
                sediment_accumulator += incoming_sediment;
            }
        }
    }
    
    return vec2<f32>(water_accumulator, sediment_accumulator);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pos = vec2<i32>(i32(global_id.x), i32(global_id.y));
    
    // Early exit if outside dimensions
    if (pos.x >= i32(params.size_x) || pos.y >= i32(params.size_y)) {
        return;
    }
    
    // Get current data
    let water_data = textureLoad(water_input_tex, pos);
    let current_flowing_water = water_data.r;
    let current_flowing_sediment = water_data.g;
    let current_still_water = water_data.b;
    let current_still_sediment = water_data.a;
    
    // Initialize next state
    var next_still_water = current_still_water;
    var next_still_sediment = current_still_sediment;
    
    // Calculate still water outflow weights
    let outflow_weights = compute_normalized_still_water_weights(pos);
    
    var total_outflow_weight = 0.0;
    for (var i = 0; i < 8; i++) {
        total_outflow_weight += outflow_weights[i];
    }
    
    // Calculate outflow
    var potential_water_outflow = 0.0;
    var potential_sediment_outflow = 0.0;
    
    if (total_outflow_weight > 0.0 && current_still_water > 0.0) {
        potential_water_outflow = min(
            current_still_water,
            params.still_water_relaxation * current_still_water * total_outflow_weight
        );
        
        // Proportional sediment transfer
        let concentration = current_still_sediment / current_still_water;
        potential_sediment_outflow = potential_water_outflow * concentration;
    }
    
    // Calculate inflow
    let accumulation = accumulate_still_water_and_sediment(pos);
    let water_inflow = accumulation.x;
    let sediment_inflow = accumulation.y;
    
    // Net still water and sediment change
    let net_water_flow = water_inflow - potential_water_outflow;
    let net_sediment_flow = sediment_inflow - potential_sediment_outflow;
    
    next_still_water += net_water_flow;
    next_still_sediment += net_sediment_flow;
    
    // Store the results, preserving flowing water and sediment values
    textureStore(water_output_tex, pos, vec4<f32>(
        current_flowing_water,
        current_flowing_sediment,
        next_still_water,
        next_still_sediment
    ));
}