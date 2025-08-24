struct BlendParams {
    heightmap_weight: f32,
    distance_weight: f32,
};

struct MaxBuffer {
    value: u32,
};

@group(0) @binding(0) var<uniform> params: BlendParams;
@group(0) @binding(1) var heightmapTex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var distanceTex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var<storage, read> maxBuf: MaxBuffer;

const Q16_16_SCALE: f32 = 65536.0;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coord = vec2<i32>(i32(global_id.x), i32(global_id.y));
    let tex_size = textureDimensions(heightmapTex);

    if (global_id.x >= tex_size.x || global_id.y >= tex_size.y) {
        return;
    }

    // --- 1. Get inputs ---
    let height_sample = textureLoad(heightmapTex, coord);
    let distance_sample = textureLoad(distanceTex, coord);
    
    // Extract values
    let height_norm = height_sample.r;  // Assuming this is [0,1]
    let dist_val = distance_sample.a;   // Distance from JFA
    
    // --- 2. Normalize distance using computed max ---
    let max_dist = f32(maxBuf.value) / Q16_16_SCALE;  // Regular read, no atomic
    let dist_norm = select(
        clamp(dist_val / max_dist, 0.0, 1.0),
        0.0,
        max_dist <= 0.0  // Handle edge case where no distances were computed
    );

    // --- 3. Apply blending with mix ---
    // Convert weight to blend factor [0,1]
    let blend_factor = clamp(params.distance_weight / (params.heightmap_weight + params.distance_weight), 0.0, 1.0);
    let inverted_height = 1.0 - height_norm;  // Invert the height
    let final_height = mix(inverted_height, dist_norm, blend_factor);

    // Output as rgba32float with height in all channels for compatibility
    textureStore(outputTex, coord, vec4f(final_height, final_height, final_height, 1.0));
}