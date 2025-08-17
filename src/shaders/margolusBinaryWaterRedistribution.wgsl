struct MargolusParams {
    size_x: u32,
    size_y: u32,
    offset_x: u32,
    offset_y: u32,
    num_iterations: u32,
    _pad0: vec3<u32>,
};

struct StillWaterParams {
    size_x: u32,
    size_y: u32,
    water_height_factor: f32,
    still_water_relaxation: f32,
};

@group(0) @binding(0) var<uniform> params: MargolusParams;
@group(0) @binding(1) var terrain_tex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var water_tex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(3) var water_out_tex: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var<uniform> sw: StillWaterParams;

fn _in_bounds(x: i32, y: i32, sx: u32, sy: u32) -> bool {
    return x >= 0 && y >= 0 && x < i32(sx) && y < i32(sy);
}
fn _precompute_mask(x: i32, y: i32) -> array<array<bool,2>,2> {
    var mask: array<array<bool,2>,2>;
    for (var dy = 0; dy < 2; dy = dy + 1) {
        for (var dx = 0; dx < 2; dx = dx + 1) {
            let xx = x + dx;
            let yy = y + dy;
            mask[dy][dx] = _in_bounds(xx, yy, params.size_x, params.size_y);
        }
    }
    return mask;
}
fn _load_block(pos: vec2<i32>, mask: array<array<bool,2>,2>) -> array<array<f32,2>,2> {
    var block: array<array<f32,2>,2>;
    for (var dy = 0; dy < 2; dy = dy + 1) {
        for (var dx = 0; dx < 2; dx = dx + 1) {
            if (mask[dy][dx]) {
                let xx = pos.x + dx;
                let yy = pos.y + dy;
                block[dy][dx] = textureLoad(terrain_tex, vec2<i32>(xx, yy)).r;
            } else {
                block[dy][dx] = 0.0;
            }
        }
    }
    return block;
}
fn _load_water_block(pos: vec2<i32>, mask: array<array<bool,2>,2>) -> array<array<f32,2>,2> {
    var block: array<array<f32,2>,2>;
    for (var dy = 0; dy < 2; dy = dy + 1) {
        for (var dx = 0; dx < 2; dx = dx + 1) {
            if (mask[dy][dx]) {
                let xx = pos.x + dx;
                let yy = pos.y + dy;
                // Read STILL water from B
                block[dy][dx] = textureLoad(water_tex, vec2<i32>(xx, yy)).b;
            } else {
                block[dy][dx] = 0.0;
            }
        }
    }
    return block;
}
fn binary_search_water_level(
    terrain_block: array<array<f32,2>,2>,
    total_water: f32,
    mask: array<array<bool,2>,2>
) -> f32 {
    var valid: array<f32,4>;
    var n: u32 = 0u;
    var min_val: f32 = 1e20;
    var max_val: f32 = -1e20;
    for (var dy = 0; dy < 2; dy = dy + 1) {
        for (var dx = 0; dx < 2; dx = dx + 1) {
            if (mask[dy][dx]) {
                let v = terrain_block[dy][dx];
                valid[n] = v;
                n = n + 1u;
                if (v < min_val) { min_val = v; }
                if (v > max_val) { max_val = v; }
            }
        }
    }
    if (total_water <= 0.0 || n == 0u) {
        return min_val;
    }
    var low = min_val;
    var high = max_val + total_water / f32(n);

    for (var iter: u32 = 0u; iter < params.num_iterations; iter = iter + 1u) {
        let mid = 0.5 * (low + high);
        var water_needed: f32 = 0.0;
        for (var i: u32 = 0u; i < n; i = i + 1u) {
            water_needed = water_needed + max(0.0, mid - valid[i]);
        }
        if (water_needed < total_water) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return 0.5 * (low + high);
}

@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.size_x || gid.y >= params.size_y) { return; }

    let ux: u32 = gid.x;
    let uy: u32 = gid.y;
    if (((ux - params.offset_x) & 1u) != 0u || ((uy - params.offset_y) & 1u) != 0u) {
        return;
    }

    let bx = i32(gid.x);
    let by = i32(gid.y);
    let mask = _precompute_mask(bx, by);
    let terrain_block = _load_block(vec2<i32>(bx, by), mask);
    let water_block = _load_water_block(vec2<i32>(bx, by), mask);

    // Convert stored still-water “volume” to height units for the solver
    var total_water_height: f32 = 0.0;
    for (var dy = 0; dy < 2; dy = dy + 1) {
        for (var dx = 0; dx < 2; dx = dx + 1) {
            if (mask[dy][dx]) {
                total_water_height = total_water_height + water_block[dy][dx] * sw.water_height_factor;
            }
        }
    }

    let water_level = binary_search_water_level(terrain_block, total_water_height, mask);

    for (var dy = 0; dy < 2; dy = dy + 1) {
        for (var dx = 0; dx < 2; dx = dx + 1) {
            let xx = bx + dx;
            let yy = by + dy;
            if (mask[dy][dx]) {
                // Equilibrated height
                let eq_h = max(0.0, water_level - terrain_block[dy][dx]);
                // Convert back to stored units
                let f = max(sw.water_height_factor, 1e-12);
                let eq_v = eq_h / f;

                // Preserve R,G,A; write B = eq_v
                let src = textureLoad(water_tex, vec2<i32>(xx, yy));
                textureStore(water_out_tex, vec2<i32>(xx, yy), vec4<f32>(src.r, src.g, eq_v, src.a));
            }
        }
    }
}