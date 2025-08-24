struct Uniforms {
    stepSize: i32,
    gridWidth: i32,
    gridHeight: i32,
    computeMax: u32,  // 1 for final pass, 0 for others
};

// Global atomic max (Q16.16 fixed-point)
struct MaxBuffer {
    value: atomic<u32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var<storage, read_write> maxBuf: MaxBuffer;

const WORKGROUP_SIZE: u32 = 256u;
const Q16_16_SCALE: f32 = 65536.0;

// Shared workgroup memory for max
var<workgroup> localMax: array<u32, WORKGROUP_SIZE>;

@compute @workgroup_size(16, 16)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(local_invocation_index) local_idx: u32
) {
    let x = i32(global_id.x);
    let y = i32(global_id.y);

    var myMax: f32 = -1.0;

    if (x < uniforms.gridWidth && y < uniforms.gridHeight) {
        var current = textureLoad(inputTex, vec2<i32>(x, y));
        var bestSeed = current.rgb;
        var bestDist = current.a;

        let step = uniforms.stepSize;
        let neighbors_offset = array<vec2<i32>, 8>(
            vec2<i32>( step,  step), vec2<i32>( step, -step), vec2<i32>(-step,  step), vec2<i32>(-step, -step),
            vec2<i32>( step,  0),    vec2<i32>(-step,  0),    vec2<i32>( 0,     step), vec2<i32>( 0,    -step)
        );

        for (var i = 0u; i < 8u; i = i + 1u) {
            let coord = vec2<i32>(x, y) + neighbors_offset[i];
            if (coord.x >= 0 && coord.x < uniforms.gridWidth &&
                coord.y >= 0 && coord.y < uniforms.gridHeight) {

                let neighbor = textureLoad(inputTex, coord);
                if (neighbor.r >= 0.0) {
                    let seedPos = vec2<f32>(neighbor.rg);
                    let pixelPos = vec2<f32>(f32(x), f32(y));
                    let dist = distance(seedPos, pixelPos);

                    if (dist < bestDist) {
                        bestDist = dist;
                        bestSeed = neighbor.rgb;
                    }
                }
            }
        }

        textureStore(outputTex, vec2<i32>(x, y), vec4<f32>(bestSeed, bestDist));

        myMax = bestDist;
    }

    // Only do atomic max computation on final pass
    if (uniforms.computeMax == 1u) {
        // Quantize to Q16.16 and store in shared memory
        localMax[local_idx] = u32(max(myMax, 0.0) * Q16_16_SCALE);
        workgroupBarrier();

        // Parallel reduction in shared memorys
        var stride = 128u;
        while (stride > 0u) {
            if (local_idx < stride) {
                localMax[local_idx] = max(localMax[local_idx], localMax[local_idx + stride]);
            }
            workgroupBarrier();
            stride = stride >> 1u; // Bitwise right shift
        }

        // Thread 0 of the workgroup does the atomicMax
        if (local_idx == 0u) {
            atomicMax(&maxBuf.value, localMax[0]);
        }
    }
}
