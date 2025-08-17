@group(0) @binding(0) var terrain_in:  texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var water_in:    texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var terrain_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var<uniform> stillParams: StillWaterParams;
@group(0) @binding(4) var<uniform> thermalParams: ThermalParams;

// Uniform parameters for still-water related conversions
struct StillWaterParams {
    size_x: u32,
    size_y: u32,
    water_height_factor: f32,
    still_water_relaxation: f32,
}

// Thermal erosion parameters 
struct ThermalParams {
    // Talus by moisture state
    talus_wet: f32,
    talus_immersed: f32,
    talus_low_height: f32,
    talus_high_height: f32,
    talus_dry_low: f32,
    talus_dry_high: f32,

    // Flowing wetness ramp (uses R directly)
    flow_wet_min: f32,
    flow_wet_max: f32,

    // Immersion ramp in HEIGHT units (scaled by water_height_factor)
    immerse_min_x: f32,
    immerse_max_x: f32,

    // Thermal erosion dynamics
    thermal_strength: f32,
    max_delta_per_pass: f32,
}

// 8-neighborhood (clockwise from NW)
const NEIGHBOR_OFFSETS: array<vec2<i32>, 8> = array<vec2<i32>, 8>(
    vec2<i32>(-1,  1), vec2<i32>(0,  1), vec2<i32>(1,  1),
    vec2<i32>( 1,  0), vec2<i32>(1, -1), vec2<i32>(0, -1),
    vec2<i32>(-1, -1), vec2<i32>(-1, 0)
);
const SQRT2: f32 = 1.4142135623730951;
const NEIGHBOR_DIST: array<f32, 8> = array<f32, 8>(
    SQRT2, 1.0, SQRT2,
    1.0,   SQRT2, 1.0,
    SQRT2, 1.0
);

fn clamp_idx(x: i32, y: i32, w: i32, h: i32) -> vec2<i32> {
    return vec2<i32>(clamp(x, 0, w-1), clamp(y, 0, h-1));
}

fn height_adjusted_talus_dry(h: f32) -> f32 {
    if (h <= thermalParams.talus_low_height) {
        return thermalParams.talus_dry_low;
    } else if (h >= thermalParams.talus_high_height) {
        return thermalParams.talus_dry_high;
    } else {
        let t = (h - thermalParams.talus_low_height) / (thermalParams.talus_high_height - thermalParams.talus_low_height);
        return mix(thermalParams.talus_dry_low, thermalParams.talus_dry_high, t);
    }
}

fn talus_from_water(w: vec4<f32>, terrain_height: f32) -> f32 {
    // Base dry talus based on height
    let dry_talus = height_adjusted_talus_dry(terrain_height);

    // Flowing “wetness” increases apparent cohesion → higher talus
    let flow_wet = smoothstep(thermalParams.flow_wet_min, thermalParams.flow_wet_max, w.r);

    // Immersion based on depth in HEIGHT units
    let depth_h = w.b * stillParams.water_height_factor;
    let d_min = thermalParams.immerse_min_x * stillParams.water_height_factor;
    let d_max = thermalParams.immerse_max_x * stillParams.water_height_factor;
    let immerse = smoothstep(d_min, d_max, depth_h);

    let base = mix(dry_talus, thermalParams.talus_wet, flow_wet);
    return mix(base, thermalParams.talus_immersed, immerse);
}

@compute @workgroup_size(16,16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims_u = textureDimensions(terrain_in);
    if (gid.x >= dims_u.x || gid.y >= dims_u.y) { return; }
    let dims = vec2<i32>(i32(dims_u.x), i32(dims_u.y));

    let p = vec2<i32>(i32(gid.x), i32(gid.y));
    let h = textureLoad(terrain_in, p).r;
    let w = textureLoad(water_in, p);

    // Local talus slope from moisture state (no “near water” gating)
    let allowed = talus_from_water(w, h);

    // Gather-style thermal erosion (distance-corrected)
    var inflow = 0.0;
    var outflow = 0.0;

    for (var i = 0; i < 8; i++) {
        let q = clamp_idx(p.x + NEIGHBOR_OFFSETS[i].x, p.y + NEIGHBOR_OFFSETS[i].y, dims.x, dims.y);
        let hq = textureLoad(terrain_in, q).r;

        let run = NEIGHBOR_DIST[i];        // 1 for axial, sqrt(2) for diagonals
        let slope = (h - hq) / run;        // rise/run to neighbor

        if (slope > allowed) {
            // Too steep down to neighbor: move excess
            let excess_dh = (slope - allowed) * run;
            outflow += excess_dh * thermalParams.thermal_strength;
        } else if (-slope > allowed) {
            // Too steep up from neighbor: receive material
            let excess_dh = ((-slope) - allowed) * run;
            inflow += excess_dh * thermalParams.thermal_strength;
        }
    }

    var h_new = h + inflow - outflow;

    // Per-pass clamp
    let delta = clamp(h_new - h, -thermalParams.max_delta_per_pass, thermalParams.max_delta_per_pass);
    h_new = h + delta;

    var outv = textureLoad(terrain_in, p);
    outv.r = h_new;
    textureStore(terrain_out, p, outv);
}