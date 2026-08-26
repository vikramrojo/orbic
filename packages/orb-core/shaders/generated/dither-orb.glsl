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

// Dither — a smooth signal quantised through an ordered Bayer threshold.
//
// The other fields are continuous materials. This one is deliberately not:
// its whole character is hard on/off cells, so the transition between tone
// levels is a visible field of dots rather than a gradient.
//
// THE BAYER MATRIX, WITHOUT AN ARRAY
//
// The classic implementation is a 4x4 lookup table. That is unavailable here:
// the portable subset bans dynamic array indexing (docs/shader-abi.md), so
// `bayer[y * 4 + x]` cannot be written at all. The bit-interleaving trick is
// also avoided — bitwise operators are not part of the documented subset, and
// nothing in this repo asserts they behave identically across GLSL ES 3.00,
// SkSL and MSL, so relying on them would be relying on luck.
//
// Instead the matrix is computed from its own recurrence,
//
//     M4(x, y) = 4 * M2(x mod 2, y mod 2) + M2(floor(x/2), floor(y/2))
//
// with M2(x, y) = (2x + 3y) mod 4. That reproduces the canonical Bayer 4x4
// (0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5) exactly — verified against the
// published matrix before it was written here — in pure float arithmetic.
//
// WORLD SPACE, NOT PIXELS
//
// The dither cell is sized in WORLD units, not fragment coordinates. Keying it
// to pixels is the obvious thing and it is wrong twice over: the orb and the
// surface use different `scale`, so the cell would change size between the two
// shapes and break the "same material" claim, and the aspect-distortion check
// renders the same world region at several resolutions and would see the cell
// resize under it.
//
// COST: ~4 hashes for the underlying signal plus the Bayer arithmetic — the
// cheapest field here, comparable to chladni (~3).

// Bayer 2x2, the seed of the recurrence: [[0, 2], [3, 1]].
float ditherBayer2(float x, float y) {
    return oMod(2.0 * x + 3.0 * y, 4.0);
}

/// Canonical Bayer 4x4 threshold at integer cell (x, y), normalised to 0..1.
float ditherBayer4(float x, float y) {
    float lo = ditherBayer2(oMod(x, 2.0), oMod(y, 2.0));
    float hi = ditherBayer2(oMod(floor(x * 0.5), 2.0), oMod(floor(y * 0.5), 2.0));
    return (4.0 * lo + hi) / 16.0;
}

float ditherHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float ditherNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = ditherHash(i);
    float b = ditherHash(i + vec2(1.0, 0.0));
    float c = ditherHash(i + vec2(0.0, 1.0));
    float d = ditherHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` already carries `pulse` and the component's `speed`
    // (docs/shader-abi.md); multiplying again would apply it twice.
    float clock = t;

    // THE SINGLE STRUCTURAL AXIS.
    //
    // Cell size and the number of tone levels are two separate ideas riding
    // one `coherence` curve, because that is the only structural channel the
    // frozen ABI provides (gate-3.5/findings.md). High coherence is a fine
    // cell with many levels — nearly continuous; low coherence is a coarse
    // cell with few levels — chunky and graphic. "Coarse cell, many levels"
    // is unreachable, and that is a property of the contract.
    float cellSize = mix(0.055, 0.022, coherence);
    float levels = mix(3.0, 7.0, coherence);

    // The signal being quantised: slow drifting noise, plus a gentle radial
    // fall so the orb reads as lit from its centre rather than as flat tone.
    float signal = ditherNoise(p * 3.1 + vec2(clock * 0.09, clock * -0.06)) * 0.75
                 + ditherNoise(p * 6.7 - vec2(clock * 0.05, clock * 0.08)) * 0.25;
    signal = mix(signal, 1.0 - length(p) * 0.9, 0.35);

    // Integer cell coordinates in WORLD space — see the header.
    vec2 cell = floor(p / cellSize);
    float threshold = ditherBayer4(cell.x, cell.y);

    // Ordered dithering proper: add the threshold before quantising, so the
    // rounding error becomes a spatial pattern instead of a hard contour.
    float quantised = floor(signal * levels + threshold) / levels;
    quantised = clamp(quantised, 0.0, 1.0);

    float amplitude = mix(0.30, 1.0, energy);

    // Warmth is authored, not remapped: no field in this lineage has a native
    // warmth concept (docs/shader-abi.md), so the palette is original work.
    vec3 cool = vec3(0.30, 0.46, 0.76);
    vec3 warm = vec3(0.86, 0.52, 0.26);
    vec3 tint = mix(cool, warm, warmth);

    // Capped deliberately low. The contrast check measures the SINGLE
    // BRIGHTEST pixel against white body text, and a dither's brightest cell
    // is fully on by construction — the one thing this family does that the
    // continuous fields do not.
    vec3 col = tint * quantised * 0.62 * amplitude;

    // Grain, matching the house convention in the other fields.
    float grain = ditherHash(p * 700.0 + clock * 11.0);
    col += (grain - 0.5) * 0.01;

    return clamp(col, 0.0, 1.0);
}


// Orb compositor: the field seen through a transparent sphere.
//
// Alpha follows the sphere's own geometry rather than a radial blur. The
// hemisphere height z = sqrt(1 - r^2) is nearly flat across the face and then
// plunges at the limb, which is what makes it read as a curved solid; a
// linear or smoothstep radial ramp is steepest in the MIDDLE, which reads as
// fog. A Fresnel term (the standard rim formulation, 1 - dot(normal,
// viewDir), which collapses to 1 - z under an orthographic view) then
// thickens the material toward the limb.
//
// This replaced two earlier versions, and the reasons both failed are worth
// keeping:
//   - A sphere mask plus an ADDITIVE white rim. The rim read as a hard bright
//     outline stamped on the background.
//   - A wide soft radial falloff with no rim at all. Removing the geometry
//     along with the rim left a blur with no form.
// The Fresnel term here drives DENSITY, never colour: glass becomes more
// opaque at a grazing angle, it does not glow white. That is the whole
// difference between "curved transparent geometry" and "hard white edge".
//
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
// `atan`, no `uniform` declarations. `smoothstep`, `length`, `sqrt` and `pow`
// are portable built-ins available identically on all three targets.

// Sphere radius in world space. Kept under 0.5 so the feathered limb still
// lands inside the viewport: world space is normalised by
// min(resolution.x, resolution.y), so 0.5 is exactly the half-extent along
// each axis while the corners reach ~0.707. A silhouette still carrying alpha
// at 0.5 would be cut flat against the sides and continue into the corners —
// a square halo rather than a round one.
const float ORB_RADIUS = 0.46;

// Width of the feather on the silhouette. Deliberately SMALL. The orb reads
// as a sphere because of the z-curvature below, not because of a wide blur —
// an earlier version widened this into a long ramp and the result read as fog
// with no geometry to it.
const float ORB_LIMB_FEATHER = 0.035;

// How transparent the orb is face-on. The limb always reaches full density,
// so this is what makes the middle read as something you can see into.
const float ORB_CORE_ALPHA = 0.42;

// Falloff of the Fresnel term from limb to centre.
//
// Tuned by measuring the alpha profile, not by eye: at 2.5 the densification
// was confined to a sliver at the limb that the feather then ate, leaving a
// FLAT disc (alpha ~140/255 from centre to r=0.7) with a soft edge — the same
// "no geometry" failure as the blur it replaced. At 1.2 the gradient spans
// the face: ~107 at centre, ~124 at half radius, ~190 near the limb.
const float ORB_FRESNEL_POWER = 1.2;

vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    vec3 color = field(p, t, energy, coherence, warmth, pulse);

    float dist = length(p);
    float r = min(dist / ORB_RADIUS, 1.0);

    // The hemisphere's height at this radius — the z of a unit sphere seen
    // head-on. This is the curvature: nearly flat across the face, then
    // plunging toward 0 at the limb. A linear or smoothstep radial ramp does
    // the opposite (steepest in the middle), which is why one reads as a ball
    // and the other as a blur.
    float z = sqrt(max(1.0 - r * r, 0.0));

    // Standard Fresnel/rim term. For an orthographic view the view direction
    // is (0, 0, 1), so dot(normal, viewDir) collapses to z and no explicit
    // normal vector is needed. 0 face-on, 1 at the limb.
    float fresnel = pow(1.0 - z, ORB_FRESNEL_POWER);

    // Fresnel drives DENSITY, never colour. Adding it to the colour instead
    // is what produced the hard white rim this replaced: glass gets more
    // opaque at a grazing angle, it does not glow white.
    float density = mix(ORB_CORE_ALPHA, 1.0, fresnel);

    // Feathers the last fraction of the silhouette so the limb is not a hard
    // cut, while staying narrow enough that the circle still reads as round.
    float silhouette = 1.0 - smoothstep(ORB_RADIUS - ORB_LIMB_FEATHER, ORB_RADIUS + ORB_LIMB_FEATHER, dist);

    float alpha = density * silhouette;

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
// `edge` and `backlight` are orb-specific — NOT part of the frozen
// four-channel ABI, which field()/composite() alone see. They are the Orb
// component's public props, and they live here rather than in the compositor
// because composite()'s signature is frozen: no per-instance value can reach
// it. What an epilogue CAN do is post-process what the compositor returned,
// and it has `p`, so it can work in the same geometry the compositor did.
//
// `edge` narrows the silhouette feather. It works in the FEATHER COORDINATE
// rather than on alpha, and that distinction is load-bearing: with a
// transparent core the interior sits around alpha 0.42 while the feather
// sweeps 0.6 down to 0, so the two ranges OVERLAP and no alpha-space remap
// can tell them apart. An earlier version tried, and raising `edge` hollowed
// out the middle of the orb instead of tightening its edge. Because this
// epilogue shares the compositor's constants and formula, it can divide the
// compositor's own feather back out and substitute a narrower one, leaving
// interior density untouched.
//
// `backlight` is a light BEHIND the sphere: it brightens the limb from behind
// and spills a little past the silhouette, which is how a translucent object
// reads as lit. Deliberately not the additive white rim an earlier compositor
// drew and which was removed for looking like a hard outline stamped on the
// background — this glow is tinted by the field's own colour and carries its
// own alpha, so it reads as light AROUND the object rather than a ring
// painted on it. The halo has only ORB_RADIUS..0.5 of world space before the
// square viewport clips it, so it is deliberately tight; widening it means
// shrinking ORB_RADIUS, which shrinks the orb inside its box.
//
// Both read ORB_RADIUS and ORB_LIMB_FEATHER straight from the compositor: the
// build concatenates preamble + field + compositor + epilogue into a single
// translation unit, so its program-scope constants are in scope here.

uniform float u_edge;
uniform float u_backlight;

const float ORB_SCALE = 1.0;

// Feather-coordinate window the sharpened silhouette uses. Narrower than the
// compositor's full 0..1 sweep, which is what makes the limb tighter.
const float ORB_EDGE_SHARP_LO = 0.40;
const float ORB_EDGE_SHARP_HI = 0.62;

// How far past the silhouette the backlit halo reaches, in world units.
const float ORB_HALO_WIDTH = 0.035;
// Concentration of the backlight on the limb. Higher hugs the edge tighter.
const float ORB_BACKLIGHT_POWER = 2.2;

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * ORB_SCALE;
    vec4 composited = composite(p, u_time, u_energy, u_coherence, u_warmth, u_pulse);

    // composite() returns PREMULTIPLIED colour, so recover the straight colour
    // before touching alpha — otherwise every adjustment below would darken it
    // as a side effect. At alpha 0 the numerator is 0 too, so the guarded
    // divide yields 0 rather than a NaN.
    vec3 straight = composited.rgb / max(composited.a, 1e-5);

    float dist = length(p);

    // Position within the compositor's feather band: 0 at its inner edge,
    // 1 at its outer edge. Reproducing the compositor's own curve here is
    // what lets it be divided back out.
    float u = clamp((dist - (ORB_RADIUS - ORB_LIMB_FEATHER)) / (2.0 * ORB_LIMB_FEATHER), 0.0, 1.0);
    float baseSilhouette = 1.0 - smoothstep(0.0, 1.0, u);
    float sharpSilhouette = 1.0 - smoothstep(ORB_EDGE_SHARP_LO, ORB_EDGE_SHARP_HI, u);

    // Ratio, not replacement: interior pixels have u = 0, where both curves
    // are 1, so they pass through completely unchanged at any `edge`.
    float silhouetteScale = mix(1.0, sharpSilhouette / max(baseSilhouette, 1e-4), u_edge);
    float alpha = clamp(composited.a * silhouetteScale, 0.0, 1.0);

    // Rear lighting: `limb` peaks where the sphere turns away from the viewer,
    // `halo` continues just past the silhouette.
    float r = min(dist / ORB_RADIUS, 1.0);
    float z = sqrt(max(1.0 - r * r, 0.0));
    float limb = pow(1.0 - z, ORB_BACKLIGHT_POWER);
    float halo = 1.0 - smoothstep(ORB_RADIUS, ORB_RADIUS + ORB_HALO_WIDTH, dist);
    float glow = u_backlight * limb * halo;

    // Lifted toward white only slightly, so a strong backlight warms the limb
    // rather than bleaching it.
    vec3 glowColor = mix(straight, vec3(1.0), 0.35);

    // Composited UNDER the orb: the glow supplies its own alpha, which is what
    // lets it exist just outside the body instead of merely brightening pixels
    // the orb already covers.
    float outAlpha = clamp(alpha + glow * (1.0 - alpha), 0.0, 1.0);
    vec3 outColor = (straight * alpha + glowColor * glow * (1.0 - alpha)) / max(outAlpha, 1e-5);

    oFragColor = vec4(outColor * outAlpha, outAlpha);
}
