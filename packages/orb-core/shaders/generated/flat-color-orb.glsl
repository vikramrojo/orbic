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


// Orb compositor: a soft radial falloff over the field's colour, with no
// silhouette edge and no rim shading.
//
// This deliberately replaced an earlier sphere-mask-plus-rim compositor. That
// version cut alpha across a 0.04-wide band at radius 0.5 and brightened a
// band just inside it, which read as a lit 3D ball with a crisp cut-out edge.
// The look Orbic wants is flatter and quieter — the orb should sit in its
// background rather than be stamped onto it — so the mask became a long
// falloff and the rim term was removed outright rather than turned down.
// Per-instance firmness is not this file's job: the `edge` prop is applied in
// the epilogue, which post-processes the alpha returned here (see
// targets/epilogue-orb.glsl). composite()'s signature is frozen, so a
// per-instance value could not reach this function anyway.
//
// Returns PREMULTIPLIED colour and alpha (`vec4(rgb * a, a)`), per the
// two-function contract in docs/shader-abi.md: `composite()` alone decides
// visibility, so the orb composites over an arbitrary background without dark
// fringing.
//
// Written once in the portable subset — no texture sampling, no `discard`,
// no `while`, no dynamic indexing, no preprocessor, no bare `mod`/two-arg
// `atan`, no `uniform` declarations. `smoothstep`, `length` and `pow` are
// portable built-ins available identically on all three targets.

// Radius at which the falloff begins. Inside this the orb is fully opaque.
const float ORB_CORE_RADIUS = 0.18;

// Radius at which alpha reaches exactly 0.
//
// This MUST NOT exceed 0.5. World space is normalised by
// min(resolution.x, resolution.y) and the orb is drawn into a square, so 0.5
// is exactly the viewport half-extent along each axis while the corners reach
// ~0.707. A falloff still carrying alpha at 0.5 would therefore be cut flat
// against the left/right/top/bottom edges while continuing into the corners —
// reading as a faint square halo rather than a round one.
const float ORB_FADE_RADIUS = 0.5;

// Shapes the shoulder of the falloff. Above 1 the orb holds its body and then
// releases quickly; at 1 it is the bare smoothstep, which reads flat-topped.
const float ORB_FALLOFF_SHAPE = 1.35;

vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    vec3 color = field(p, t, energy, coherence, warmth, pulse);

    float dist = length(p);

    // 1 in the core, easing to exactly 0 at ORB_FADE_RADIUS. `smoothstep`
    // reaching a true 0 (rather than an exponential tail that only
    // approaches it) is what keeps the "transparent outside the orb"
    // guarantee real.
    float falloff = 1.0 - smoothstep(ORB_CORE_RADIUS, ORB_FADE_RADIUS, dist);

    float alpha = pow(max(falloff, 0.0), ORB_FALLOFF_SHAPE);

    return vec4(color * alpha, alpha);
}


// Orbic epilogue — orb shape, GLSL ES 3.00.
//
// Maps the fragment coordinate into aspect-preserving world space at orb
// scale (p spans roughly a unit disc — see docs/shader-abi.md) and calls
// the compositor. `u_time` is assumed already wrapped (at 3600 s) by the
// caller before being written to this uniform; the epilogue does no
// per-pixel wrapping of its own.
//
// u_edge is orb-specific — not part of the frozen four-channel ABI
// (energy/coherence/warmth/pulse), which field()/composite() alone see. It is
// plumbing local to this epilogue, exactly like u_scale on the surface
// epilogue, and is exposed as the Orb component's public `edge` prop.
//
// It has to live HERE rather than in compositors/orb.orb because
// composite()'s signature is frozen (docs/shader-abi.md), so no per-instance
// value can be passed into it. What the epilogue can do is post-process what
// composite() returns: the compositor hands back a soft alpha ramp, and
// firming that ramp with a steeper transfer curve is exactly "a more defined
// border". Scaling `p` instead would only zoom, since the transition band
// scales with the radius and softness-as-a-fraction stays constant.

uniform float u_edge;

const float ORB_SCALE = 1.0;

// Alpha window the firming curve steepens across. Chosen around the midpoint
// of the compositor's falloff so raising `edge` tightens the silhouette
// symmetrically instead of eroding or inflating the orb.
const float ORB_EDGE_LO = 0.35;
const float ORB_EDGE_HI = 0.62;

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * ORB_SCALE;
    vec4 composited = composite(p, u_time, u_energy, u_coherence, u_warmth, u_pulse);

    // composite() returns PREMULTIPLIED colour, so recover the straight colour
    // before changing alpha — otherwise firming the edge would also darken it.
    // The max() guards the fully transparent case; at alpha 0 the numerator is
    // 0 too, so the result stays 0 rather than becoming a NaN.
    vec3 straight = composited.rgb / max(composited.a, 1e-5);

    float firmed = smoothstep(ORB_EDGE_LO, ORB_EDGE_HI, composited.a);
    // Mixing the RESULT (rather than the smoothstep bounds) makes edge = 0 an
    // exact pass-through; smoothstep(0, 1, a) would already be an S-curve.
    float alpha = mix(composited.a, firmed, u_edge);

    oFragColor = vec4(straight * alpha, alpha);
}
