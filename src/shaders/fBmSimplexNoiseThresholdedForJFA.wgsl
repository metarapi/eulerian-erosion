// ---------- Simplex Noise Implementation ----------
fn mod289(x: vec2f) -> vec2f {
    return x - floor(x * (1. / 289.)) * 289.;
}

fn mod289_3(x: vec3f) -> vec3f {
    return x - floor(x * (1. / 289.)) * 289.;
}

fn permute3(x: vec3f) -> vec3f {
    return mod289_3(((x * 34.) + 1.) * x);
}

fn simplexNoise2(v: vec2f) -> f32 {
    let C = vec4(
        0.211324865405187, // (3.0-sqrt(3.0))/6.0  - skew/unskew factor
        0.366025403784439, // 0.5*(sqrt(3.0)-1.0)  - simplex skew factor
        -0.577350269189626, // -1.0 + 2.0 * C.x    - corner offset
        0.024390243902439 // 1.0 / 41.0            - gradient scale
    );

    // First corner
    var i = floor(v + dot(v, C.yy));
    let x0 = v - i + dot(i, C.xx);

    // Other corners
    var i1 = select(vec2(0., 1.), vec2(1., 0.), x0.x > x0.y);

    var x12 = x0.xyxy + C.xxzz;
    x12.x = x12.x - i1.x;
    x12.y = x12.y - i1.y;

    // Permutations
    i = mod289(i);
    var p = permute3(permute3(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
    var m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3(0.));
    m *= m;
    m *= m;

    // Gradients
    let x = 2. * fract(p * C.www) - 1.;
    let h = abs(x) - 0.5;
    let ox = floor(x + 0.5);
    let a0 = x - ox;

    // Normalize gradients
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    // Compute final noise value
    let g = vec3(a0.x * x0.x + h.x * x0.y, a0.yz * x12.xz + h.yz * x12.yw);
    return 130. * dot(m, g);
}

// ---------- Simplified fBm Implementation ----------
const m2 = mat2x2f(vec2f(0.8, 0.6), vec2f(-0.6, 0.8));

fn simplifiedFbm(p: vec2f, octaves: u32, zoom: f32, persistence: f32) -> f32 {
    var f: f32 = 0.0;
    var totalWeight: f32 = 0.0;
    var amp: f32 = 1.0;
    var freq: f32 = 1.0 / zoom;
    var scaledP = p * freq;
    
    for (var i: u32 = 0u; i < octaves; i = i + 1u) {
        f += amp * simplexNoise2(scaledP);
        totalWeight += amp;
        
        // Rotate, double frequency, and scale amplitude by persistence for next octave
        scaledP = m2 * scaledP * 2.0;
        amp *= persistence; // Adjustable (typically 0.5-0.65)
    }
    
    // Normalize by total weight and map to [0, 1]
    let normalized = f / totalWeight;
    return normalized * 0.5 + 0.5;
    // Keep in range -1..1
    // return f / totalWeight;
}

// ---------- Updated Compute Shader ----------
struct HeightmapParams {
    size_x: u32,
    size_y: u32,
    octaves: u32,       // Number of octaves for fBm
    zoom: f32,          // Base frequency zoom factor
    persistence: f32,   // Persistence for amplitude scaling
    seed: f32,          // Random seed
    warp_factor: f32,   // Factor to control domain warping
    threshold: f32,      // Threshold for JFA
}

@group(0) @binding(0) var<uniform> params: HeightmapParams;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var jfaSeedTexture: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let x = global_id.x;
    let y = global_id.y;
    
    // Early exit if outside the texture dimensions
    if (x >= params.size_x || y >= params.size_y) {
        return;
    }
    
    // Scale coordinates to [-1, 1]
    let nx = (f32(x) / f32(params.size_x)) * 2.0 - 1.0;
    let ny = (f32(y) / f32(params.size_y)) * 2.0 - 1.0;
    
    // Add seed offset to coords
    var p = vec2f(nx, ny) + vec2f(params.seed * 43.0, params.seed * 17.0);

    // Generate a proper 2D vector field for the warp
    // Sample noise at two different locations to get independent x and y components.
    let q = p * 2.0; // A different scale for the flow field
    let warp_x = simplexNoise2(q + vec2f(5.2, 1.3));
    let warp_y = simplexNoise2(q + vec2f(1.7, 8.3));

    let warp_vec = vec2f(warp_x, warp_y); // If I need to return it later on

    // --- Domain warping ---
    if (params.warp_factor != 0.0) {
        p = p + warp_vec * params.warp_factor;
    }

    // Generate height using simplified fBm (in range 0..1)
    let height = simplifiedFbm(p, params.octaves, params.zoom, params.persistence);

    // JFA seed encoding
    var outVal: vec4f;
        if (height > params.threshold) {
        // Seed: store (x,y,height,0)
        outVal = vec4f(f32(x), f32(y), height, 0.0);
    } else {
        // Non-seed: store (-1,-1,0,inf)
        outVal = vec4f(-1.0, -1.0, 0.0, 1e9);
    }
    
    // Store results
    textureStore(outputTexture, vec2<i32>(i32(x), i32(y)), vec4f(height, 0.0, 0.0, 1.0));
    textureStore(jfaSeedTexture, vec2<i32>(i32(x), i32(y)), outVal);
}