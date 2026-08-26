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
