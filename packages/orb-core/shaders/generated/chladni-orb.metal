// Orbic shader preamble — Metal Shading Language ([[stitchable]]).
//
// Declares no uniform globals: unlike GLSL and SkSL, MSL `[[stitchable]]`
// functions have no global uniform storage to read — the ABI arrives as
// explicit function arguments on the epilogue's entry point instead (see
// epilogue-orb.metal / epilogue-surface.metal). This file only defines the
// portable-subset shims. See docs/shader-abi.md.

#include <metal_stdlib>
using namespace metal;

// True modulo (result takes the sign of `y`). Metal's native `fmod` takes
// the sign of `x` instead — e.g. fmod(-1.5, 6.0) == -1.5, not the 4.5 that
// GLSL's mod(-1.5, 6.0) produces — and every field is centred on the
// origin, so roughly half its domain hits exactly this disagreement. oMod
// is defined identically in all three preambles so there is nothing to get
// quietly wrong.
inline float oMod(float x, float y) {
    return x - y * floor(x / y);
}

inline float2 oMod(float2 x, float2 y) {
    return x - y * floor(x / y);
}

// Two-argument arctangent. Metal spells this `atan2(y, x)`, not `atan(y, x)`
// — a naming difference from GLSL/SkSL, not a semantic one. The shim lets a
// field call one name (`oAtan2`) regardless of which the target uses.
inline float oAtan2(float y, float x) {
    return atan2(y, x);
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

float hash(float2 p) {
    float3 p3 = fract(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float chladniPattern(float2 p, float n, float m) {
    float pi = 3.14159265;
    return cos(n * pi * p.x) * cos(m * pi * p.y) - cos(m * pi * p.x) * cos(n * pi * p.y);
}

// 6 mode pairs cycled through over time — no arrays needed.
float2 chladniMode(float idx) {
    if (idx < 1.0) return float2(1.0, 2.0);
    if (idx < 2.0) return float2(2.0, 3.0);
    if (idx < 3.0) return float2(3.0, 5.0);
    if (idx < 4.0) return float2(1.0, 4.0);
    if (idx < 5.0) return float2(2.0, 5.0);
    return float2(3.0, 4.0);
}

float3 field(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` arrives ALREADY scaled by `pulse` (and by the component's `speed`):
    // the runtime accumulates the field clock as the integral of
    // pulse * dt, which is the only phase-continuous way to do it, since
    // `pulse` is spring-animated and changes throughout every transition.
    // Multiplying by `pulse` again here would apply it twice — the effective
    // rate would be pulse^2 — and computing phase as t * pulse(now) instead
    // would jerk the animation by t * delta-pulse on every state change.
    // See docs/shader-abi.md.
    float clock = t;
    float2 pp = p * 2.0;

    // Cycle through mode pairs.
    float modeTime = clock * 0.15;
    float modeIdx = oMod(modeTime, 6.0);
    float idx0 = floor(modeIdx);
    float idx1 = oMod(idx0 + 1.0, 6.0);
    float blend = fract(modeIdx);
    blend = blend * blend * (3.0 - 2.0 * blend);

    float2 mode0 = chladniMode(idx0);
    float2 mode1 = chladniMode(idx1);

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
    float3 sandCool = mix(float3(0.35, 0.42, 0.55), float3(0.78, 0.84, 0.93), sand);
    float3 sandWarm = mix(float3(0.65, 0.45, 0.22), float3(0.95, 0.78, 0.40), sand);
    float3 sandCol = mix(sandCool, sandWarm, warmth);

    float3 plateCool = float3(0.02, 0.025, 0.035);
    float3 plateWarm = float3(0.03, 0.025, 0.02);
    float3 plate = mix(plateCool, plateWarm, warmth);

    // Bloom.
    float bloom = 1.0 - smoothstep(0.0, w * 2.5, abs(c));
    float3 bloomCool = float3(0.10, 0.15, 0.22);
    float3 bloomWarm = float3(0.25, 0.17, 0.07);

    float3 col = mix(plate, sandCol, sand);
    col += mix(bloomCool, bloomWarm, warmth) * bloom * 0.4;

    // Fine grain, kept modest.
    col += (hash(p * 700.0 + clock * 73.0) - 0.5) * 0.01;
    col = pow(max(col, 0.0), float3(0.95));

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
// Returns PREMULTIPLIED colour and alpha (`float4(rgb * a, a)`), per the
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
constant float ORB_RADIUS = 0.46;

// Width of the feather on the silhouette. Deliberately SMALL. The orb reads
// as a sphere because of the z-curvature below, not because of a wide blur —
// an earlier version widened this into a long ramp and the result read as fog
// with no geometry to it.
constant float ORB_LIMB_FEATHER = 0.035;

// How transparent the orb is face-on. The limb always reaches full density,
// so this is what makes the middle read as something you can see into.
//
// Raised from 0.42, which measured as a mean alpha of 0.52 across the disc —
// i.e. the orb was swallowing roughly half of every field's light before it
// reached a near-black page. This costs nothing in accessibility terms: the
// WCAG contrast gate measures the SURFACE compositor, which never calls this
// file. It is purely a look decision about how much you can see through.
constant float ORB_CORE_ALPHA = 0.55;

// Falloff of the Fresnel term from limb to centre.
//
// Tuned by measuring the alpha profile, not by eye: at 2.5 the densification
// was confined to a sliver at the limb that the feather then ate, leaving a
// FLAT disc (alpha ~140/255 from centre to r=0.7) with a soft edge — the same
// "no geometry" failure as the blur it replaced. At 1.2 the gradient spans
// the face: ~107 at centre, ~124 at half radius, ~190 near the limb.
constant float ORB_FRESNEL_POWER = 1.2;

float4 composite(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    float3 color = field(p, t, energy, coherence, warmth, pulse);

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

    return float4(color * alpha, alpha);
}


// Orbic epilogue — orb shape, Metal Shading Language ([[stitchable]]).
//
// Maps the fragment position into aspect-preserving world space at orb
// scale (p spans roughly a unit disc — see docs/shader-abi.md) and calls the
// compositor. Unlike the GLSL/SkSL epilogues, this one also carries the
// entire uniform ABI as explicit function arguments, because a
// [[stitchable]] function has no global uniform storage to read from (see
// preamble.metal). `time` is assumed already wrapped (at 3600 s) by the
// caller.
//
// The compositor returns `float4` — the narrowing cast to `half4` here, not
// inside the shared core, is deliberate: it keeps the shared field and
// compositor math in float precision and only narrows at the platform
// boundary that actually demands `half`. Note this file is hand-written Metal
// and is NOT run through the build's type-alias table, so it spells its types
// natively.
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
//
// `edge` and `backlight` trail the four channels as the 9th and 10th
// parameters, mirroring how `scale` trails on orbicSurface.

constant float ORB_SCALE = 1.0;

// Feather-coordinate window the sharpened silhouette uses. Narrower than the
// compositor's full 0..1 sweep, which is what makes the limb tighter.
constant float ORB_EDGE_SHARP_LO = 0.40;
constant float ORB_EDGE_SHARP_HI = 0.62;

// How far past the silhouette the backlit halo reaches, in world units.
constant float ORB_HALO_WIDTH = 0.035;
// Concentration of the backlight on the limb. Higher hugs the edge tighter.
constant float ORB_BACKLIGHT_POWER = 2.2;

[[ stitchable ]] half4 orbicOrb(
    float2 position,
    half4 color,
    float2 resolution,
    float time,
    float energy,
    float coherence,
    float warmth,
    float pulse,
    float edge,
    float backlight
) {
    float2 p = (position - 0.5 * resolution) / min(resolution.x, resolution.y) * ORB_SCALE;
    float4 composited = composite(p, time, energy, coherence, warmth, pulse);

    // composite() returns PREMULTIPLIED colour, so recover the straight colour
    // before touching alpha — otherwise every adjustment below would darken it
    // as a side effect. At alpha 0 the numerator is 0 too, so the guarded
    // divide yields 0 rather than a NaN.
    float3 straight = composited.rgb / max(composited.a, 1e-5);

    float dist = length(p);

    // Position within the compositor's feather band: 0 at its inner edge,
    // 1 at its outer edge. Reproducing the compositor's own curve here is
    // what lets it be divided back out.
    float u = clamp((dist - (ORB_RADIUS - ORB_LIMB_FEATHER)) / (2.0 * ORB_LIMB_FEATHER), 0.0, 1.0);
    float baseSilhouette = 1.0 - smoothstep(0.0, 1.0, u);
    float sharpSilhouette = 1.0 - smoothstep(ORB_EDGE_SHARP_LO, ORB_EDGE_SHARP_HI, u);

    // Ratio, not replacement: interior pixels have u = 0, where both curves
    // are 1, so they pass through completely unchanged at any `edge`.
    float silhouetteScale = mix(1.0, sharpSilhouette / max(baseSilhouette, 1e-4), edge);
    float alpha = clamp(composited.a * silhouetteScale, 0.0, 1.0);

    // Rear lighting: `limb` peaks where the sphere turns away from the viewer,
    // `halo` continues just past the silhouette.
    float r = min(dist / ORB_RADIUS, 1.0);
    float z = sqrt(max(1.0 - r * r, 0.0));
    float limb = pow(1.0 - z, ORB_BACKLIGHT_POWER);
    float halo = 1.0 - smoothstep(ORB_RADIUS, ORB_RADIUS + ORB_HALO_WIDTH, dist);
    float glow = backlight * limb * halo;

    // Lifted toward white only slightly, so a strong backlight warms the limb
    // rather than bleaching it.
    float3 glowColor = mix(straight, float3(1.0), 0.35);

    // Composited UNDER the orb: the glow supplies its own alpha, which is what
    // lets it exist just outside the body instead of merely brightening pixels
    // the orb already covers.
    float outAlpha = clamp(alpha + glow * (1.0 - alpha), 0.0, 1.0);
    float3 outColor = (straight * alpha + glowColor * glow * (1.0 - alpha)) / max(outAlpha, 1e-5);

    return half4(float4(outColor * outAlpha, outAlpha));
}
