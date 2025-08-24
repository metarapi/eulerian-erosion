// struct Uniforms {
//     stepSize: i32,
//     gridWidth: i32,
//     gridHeight: i32,
// };

// @group(0) @binding(0) var<uniform> uniforms: Uniforms;
// @group(0) @binding(1) var inputTex: texture_storage_2d<rgba32float, read>;
// @group(0) @binding(2) var outputTex: texture_storage_2d<rgba32float, write>;

// @compute @workgroup_size(16, 16)
// fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
//     let x = i32(global_id.x);
//     let y = i32(global_id.y);
    
//     // Boundary check
//     if (x >= uniforms.gridWidth || y >= uniforms.gridHeight) {
//         return;
//     }
    
//     // Read current pixel data
//     var current = textureLoad(inputTex, vec2<i32>(x, y));
//     var bestSeed = current.rgb;
//     var bestDist = current.a;
    
//     let step = uniforms.stepSize;
//     let neighbors = array<vec2<i32>, 8>(
//         vec2<i32>(x + step, y + step),
//         vec2<i32>(x + step, y - step),
//         vec2<i32>(x - step, y + step),
//         vec2<i32>(x - step, y - step),
//         vec2<i32>(x + step, y),
//         vec2<i32>(x - step, y),
//         vec2<i32>(x, y + step),
//         vec2<i32>(x, y - step)
//     );
    
//     // Check 8 neighbors
//     for (var i = 0u; i < 8u; i = i + 1u) {
//         let coord = neighbors[i];
//         if (coord.x >= 0 && coord.x < uniforms.gridWidth && 
//             coord.y >= 0 && coord.y < uniforms.gridHeight) {
            
//             let neighbor = textureLoad(inputTex, coord);
//             if (neighbor.r >= 0.0) {  // Valid seed check
//                 let seedPos = vec2<f32>(neighbor.rg);
//                 let pixelPos = vec2<f32>(f32(x), f32(y));
//                 let dist = distance(seedPos, pixelPos);
                
//                 if (dist < bestDist) {
//                     bestDist = dist;
//                     bestSeed = neighbor.rgb;
//                 }
//             }
//         }
//     }
    
//     // Write result
//     textureStore(outputTex, vec2<i32>(x, y), vec4<f32>(bestSeed, bestDist));
// }

struct Uniforms {
    stepSize: i32,
    gridWidth: i32,
    gridHeight: i32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var inputTex: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let x = i32(global_id.x);
    let y = i32(global_id.y);
    
    if (x >= uniforms.gridWidth || y >= uniforms.gridHeight) {
        return;
    }
    
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
        if (coord.x >= 0 && coord.x < uniforms.gridWidth && coord.y >= 0 && coord.y < uniforms.gridHeight) {
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
}