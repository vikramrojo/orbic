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

// Placeholder field — flat colour driven by `energy`. Not a real material:
// it exists to prove the build pipeline (preamble + field + compositor +
// epilogue, concatenated per target) end-to-end before any real field is
// ported (task group 6).
//
// Written once in the portable subset (see docs/shader-abi.md): plain GLSL-
// style syntax, no texture sampling, no `discard`, no `while`, no dynamic
// indexing, no preprocessor, no bare `mod`/two-arg `atan`, no `uniform`
// declarations of its own.

vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    return vec3(energy);
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
