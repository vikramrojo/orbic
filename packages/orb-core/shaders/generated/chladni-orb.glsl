#version 300 es
// Orbic shader preamble — GLSL ES 3.00 (WebGL2).
//
// Declares the frozen four-channel uniform ABI as globals (GLSL reads
// uniforms as globals) and the portable-subset shims. A field or compositor
// body never declares a `uniform` itself — see docs/shader-abi.md.
//
// `#version` is the literal first line, with no leading comment or
// whitespace before it — some real ES-profile front-ends (observed: the
// glslang WASM build used to validate this file) reject a shader where the
// version directive isn't the first thing in the source, even though a
// leading comment is legal per some readings of the GLSL spec. Not worth
// the risk on the one directive every target requires.

precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform float u_coherence;
uniform float u_warmth;
uniform float u_pulse;

out vec4 oFragColor;

// True modulo (result takes the sign of `y`), defined explicitly rather than
// delegated to GLSL's native `mod()` so all three targets are guaranteed to
// agree bit-for-bit on the same formula rather than on assumed equivalence.
float oMod(float x, float y) {
    return x - y * floor(x / y);
}

vec2 oMod(vec2 x, vec2 y) {
    return x - y * floor(x / y);
}

// Two-argument arctangent. GLSL spells this as the two-argument form of
// `atan`; the shim exists so a field can call one name across all three
// targets, which disagree only on what that name is (see oAtan2 in
// preamble.metal), not on the underlying semantics.
float oAtan2(float y, float x) {
    return atan(y, x);
}

// Chladni Resonance — adapted from pbakaus/radiant
// (https://github.com/pbakaus/radiant), MIT licensed. Original author:
// Paul Bakaus. Source: static/chladni-resonance.html.
//
// Adaptations for the Orbic shader ABI (see docs/shader-abi.md):
//   - Coordinate setup deleted entirely; `p` arrives already in
//     aspect-preserving world space. The original's own
//     `(gl_FragCoord.xy - u_res*0.5)/min(u_res.x,u_res.y)` already used
//     this exact convention, so of the three ported fields this is the one
//     that needed no coordinate correction, only deletion of the local
//     recomputation.
//   - `u_mouse`-driven node shift removed; meaningless on a static Surface.
//   - The circular "plate" concept — the plateMask and its background
//     swap, the edge-glow ring, the plate-proximity reflection glint, and
//     the plateDist-based vignette — is dropped rather than ported. All of
//     it draws a bounded circular object into the field's own colour,
//     which is exactly the shape/material split this ABI exists to
//     enforce: the orb compositor already masks to a `p`-radius-0.5 disc
//     (see compositors/orb.orb), so a second hard-edged circular boundary
//     drawn *inside* field() would duplicate that — and at Surface scale,
//     where the same plate radius is a small island in a much larger
//     visible window, it would read as exactly the "stranded focal point"
//     failure the world-space note in docs/shader-abi.md warns against.
//     What remains — the interference pattern itself — is unbounded by
//     construction and reads the same at any scale. This also removes the
//     original's one `atan(uv.y, uv.x)` call, which lived entirely inside
//     the dropped reflection effect.
//   - `u_modeSpeed` -> `pulse` (native).
//   - `u_complexity` -> `coherence`, inverted: complexity scales the mode
//     numbers driving the interference pattern, so higher complexity is
//     busier/higher-order nodal lines, i.e. *lower* coherence.
//   - `energy` has no native source in this field; grafted onto the sand
//     pattern's contrast exponent, so higher energy reads as a punchier,
//     more graphic pattern rather than a soft, washed-out one.
//   - `warmth` grafted as a cool (slate/silver) <-> warm (the original's
//     amber/gold) palette pair, continuous across the sand gradient, the
//     plate base colour, and the bloom tint. No radiant field has a native
//     warmth concept (see docs/shader-abi.md); this is original palette
//     authoring, not a remap.
//   - `mod(...)` (x2, mode cycling) -> `oMod`.
//   - Grain: `hash(gl_FragCoord...)` -> `hash(p * K)`. `field()` has no
//     device-pixel input — only continuous world-space `p` — so true
//     per-device-pixel grain isn't expressible here; a large spatial
//     frequency on `p` is the closest portable equivalent, and is kept a
//     little more modest than the original's amplitude (the surface
//     compositor attenuates further — see docs/shader-abi.md).

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float chladniPattern(vec2 p, float n, float m) {
    float pi = 3.14159265;
    return cos(n * pi * p.x) * cos(m * pi * p.y) - cos(m * pi * p.x) * cos(n * pi * p.y);
}

// 6 mode pairs cycled through over time — no arrays needed.
vec2 chladniMode(float idx) {
    if (idx < 1.0) return vec2(1.0, 2.0);
    if (idx < 2.0) return vec2(2.0, 3.0);
    if (idx < 3.0) return vec2(3.0, 5.0);
    if (idx < 4.0) return vec2(1.0, 4.0);
    if (idx < 5.0) return vec2(2.0, 5.0);
    return vec2(3.0, 4.0);
}

vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    float clock = t * pulse;
    vec2 pp = p * 2.0;

    // Cycle through mode pairs.
    float modeTime = clock * 0.15;
    float modeIdx = oMod(modeTime, 6.0);
    float idx0 = floor(modeIdx);
    float idx1 = oMod(idx0 + 1.0, 6.0);
    float blend = fract(modeIdx);
    blend = blend * blend * (3.0 - 2.0 * blend);

    vec2 mode0 = chladniMode(idx0);
    vec2 mode1 = chladniMode(idx1);

    // High complexity is busier/higher-order, i.e. lower coherence.
    float cScale = mix(1.8, 0.5, coherence);

    float c0 = chladniPattern(pp, mode0.x * cScale, mode0.y * cScale);
    float c1 = chladniPattern(pp, mode1.x * cScale, mode1.y * cScale);
    float c = mix(c0, c1, blend);

    // Secondary pattern for richness.
    float cb0 = chladniPattern(pp + 0.03, mode0.x * cScale + 0.5, mode0.y * cScale + 0.5);
    float cb1 = chladniPattern(pp + 0.03, mode1.x * cScale + 0.5, mode1.y * cScale + 0.5);
    float cb = mix(cb0, cb1, blend);

    // Sand on nodal lines — smoothstep for wide, visible lines.
    float w = 0.3 + 0.1 * sin(clock * 0.5);
    float sand = 1.0 - smoothstep(0.0, w, abs(c));
    float sand2 = (1.0 - smoothstep(0.0, w * 1.3, abs(cb))) * 0.35;
    sand = max(sand, sand2);

    // Energy has no native source here; grafted onto contrast.
    sand = pow(sand, mix(1.3, 0.55, energy));

    // Grain (see header: p-based, not gl_FragCoord-based; kept modest).
    float grain = hash(p * 900.0 + fract(clock * 0.1) * 100.0);
    float grainMask = smoothstep(0.1, 0.4, sand);
    sand *= 0.85 + 0.15 * grain * grainMask;

    // Warmth: cool slate/silver <-> warm amber/gold, continuous.
    vec3 sandCool = mix(vec3(0.35, 0.42, 0.55), vec3(0.78, 0.84, 0.93), sand);
    vec3 sandWarm = mix(vec3(0.65, 0.45, 0.22), vec3(0.95, 0.78, 0.40), sand);
    vec3 sandCol = mix(sandCool, sandWarm, warmth);

    vec3 plateCool = vec3(0.02, 0.025, 0.035);
    vec3 plateWarm = vec3(0.03, 0.025, 0.02);
    vec3 plate = mix(plateCool, plateWarm, warmth);

    // Bloom.
    float bloom = 1.0 - smoothstep(0.0, w * 2.5, abs(c));
    vec3 bloomCool = vec3(0.10, 0.15, 0.22);
    vec3 bloomWarm = vec3(0.25, 0.17, 0.07);

    vec3 col = mix(plate, sandCol, sand);
    col += mix(bloomCool, bloomWarm, warmth) * bloom * 0.4;

    // Fine grain, kept modest.
    col += (hash(p * 700.0 + clock * 73.0) - 0.5) * 0.01;
    col = pow(max(col, 0.0), vec3(0.95));

    return clamp(col, 0.0, 1.0);
}


// Real orb compositor (task 5.1): a sphere SDF mask with rim falloff over
// the field's colour. Glow is faked entirely in-shader as a brightened band
// near the edge — there is no bloom and no second pass (see design.md
// decision #10).
//
// Returns PREMULTIPLIED colour and alpha (`vec4(rgb * a, a)`), per the
// two-function contract in docs/shader-abi.md: `composite()` alone decides
// visibility, so the orb can be composited over an arbitrary background
// without dark fringing at the rim. `alpha` reaches exactly 0 outside the
// sphere mask.
//
// Written once in the portable subset — no texture sampling, no `discard`,
// no `while`, no dynamic indexing, no preprocessor, no bare `mod`/two-arg
// `atan`, no `uniform` declarations. `smoothstep` and `length` are portable
// built-ins available identically on all three targets, so they need no
// shim.

const float ORB_SPHERE_RADIUS = 0.5;
const float ORB_EDGE_SOFTNESS = 0.02;
const float ORB_RIM_WIDTH = 0.18;
const float ORB_RIM_INTENSITY = 0.6;

vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    vec3 color = field(p, t, energy, coherence, warmth, pulse);

    float dist = length(p);

    // 1 inside the sphere, smoothly falls to 0 across a soft edge band —
    // this alone is what lets alpha reach exactly 0 outside the mask.
    float mask = 1.0 - smoothstep(ORB_SPHERE_RADIUS - ORB_EDGE_SOFTNESS, ORB_SPHERE_RADIUS + ORB_EDGE_SOFTNESS, dist);

    // Brightens a band just inside the edge, clamped to the same mask so
    // the rim never bleeds past it — a cheap in-shader stand-in for glow.
    float rim = smoothstep(ORB_SPHERE_RADIUS - ORB_RIM_WIDTH, ORB_SPHERE_RADIUS, dist) * mask;
    vec3 litColor = color + rim * ORB_RIM_INTENSITY;

    float alpha = mask;
    return vec4(litColor * alpha, alpha);
}


// Orbic epilogue — orb shape, GLSL ES 3.00.
//
// Maps the fragment coordinate into aspect-preserving world space at orb
// scale (p spans roughly a unit disc — see docs/shader-abi.md) and calls
// the compositor. `u_time` is assumed already wrapped (at 3600 s) by the
// caller before being written to this uniform; the epilogue does no
// per-pixel wrapping of its own.

const float ORB_SCALE = 1.0;

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * ORB_SCALE;
    oFragColor = composite(p, u_time, u_energy, u_coherence, u_warmth, u_pulse);
}
