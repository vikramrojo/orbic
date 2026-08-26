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

// Ribbons — dotted bands that undulate across the plane.
//
// The reference for this family of look is the "thinking orb" indicator: an
// orb built out of DOTS arranged on structure — rings, meridians, a
// multi-band sash — rather than dots scattered at random. An earlier attempt
// here (`motes`) placed one dot per lattice cell, which covers the plane
// evenly and is therefore, visually, just noise. The structure is the point:
// dots read as an object when they lie on paths.
//
// WHY BANDS RATHER THAN RINGS
//
// The closest single reference is a ring that slowly morphs, and rings are
// what a dotted orb usually is. But a ring is a CENTRED composition, and a
// field here has to work as a `<Surface>` too — which reveals much more world
// space along its long axis, stranding any centred motif in emptiness (the
// failure docs/shader-abi.md warns about, and the reason chladni.orb dropped
// its bounded "plate").
//
// Bands solve it: they repeat across the plane, so a Surface shows a wavy
// dotted texture that keeps going, while the orb compositor's mask crops the
// same field to a disc where a handful of bands read as wrapping a sphere.
// One field, honest on both shapes.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// In the reference, dots bunch up toward the orb's edge because they are
// projected onto a sphere. That cannot happen here, and not for want of
// trying: `field()` receives only `p` and has no idea whether it is being
// composited into a sphere or a full-bleed rectangle. Perspective is a
// property of the SHAPE, and the two-function split (docs/shader-abi.md)
// puts shape in `composite()`. The orb compositor's own Fresnel densification
// supplies the sphere read instead.
//
// COST: 3 bands x 3 dot slots = 9 dot evaluations, plus 2 hashes each —
// comparable to a 3x3 lattice, between chladni (~3 hashes) and silk (~72).
// Portable subset throughout: constant-bound `for` loops, no arrays, no
// `mod`/two-arg `atan`, no textures.

float ribbonHash(float2 p) {
    float3 p3 = fract(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Vertical offset of band `band` at horizontal position `x`.
//
// Two sine terms at different frequencies rather than one: a single sine
// reads as a regular corrugation, while two beating against each other give
// the looser, hand-drawn wander the reference has.
float ribbonWave(float x, float band, float clock, float amp) {
    float phase = band * 1.7;
    return amp * (sin(x * 1.7 + phase + clock * 0.55) * 0.65
                + sin(x * 0.9 - phase * 0.6 + clock * 0.31) * 0.35);
}

float3 field(float2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` already carries `pulse` and the component's `speed`
    // (docs/shader-abi.md); multiplying again would apply it twice.
    float clock = t;

    // THE SINGLE STRUCTURAL AXIS.
    //
    // Band spacing, dot spacing, dot size and undulation amplitude are four
    // separate ideas riding one `coherence` curve, because that is the only
    // structural channel the frozen ABI provides (gate-3.5/findings.md). High
    // coherence is calm, tightly-spaced, crisp bands; low coherence is loose,
    // wide, restless ones. "Tight but restless" is unreachable, and that is a
    // property of the contract rather than an oversight here.
    // These are WORLD-SPACE units, and the orb is only ~0.92 across
    // (ORB_RADIUS 0.46). A first pass used 0.34-0.62 band spacing, which put
    // barely two bands and about eight dots inside the orb — the dots read as
    // scattered specks with no band structure at all, because there was not
    // enough of a band on screen to see. At ~0.10 spacing roughly nine bands
    // of eleven dots land in the orb, which is the density the reference has.
    float bandSpacing = mix(0.130, 0.075, coherence);
    float dotSpacing = mix(0.110, 0.062, coherence);
    float dotRadius = mix(0.022, 0.014, coherence);
    float waveAmp = mix(0.050, 0.018, coherence);

    // Bands run along x and stack along y. Rotating the whole field slightly
    // keeps them off the pixel grid, which stops the dots aliasing into
    // visible rows on a Surface.
    float2 q = float2(p.x * 0.94 - p.y * 0.34, p.x * 0.34 + p.y * 0.94);

    float bandIndex = floor(q.y / bandSpacing);
    float glow = 0.0;
    float cores = 0.0;

    // Constant bounds: the portable subset forbids unbounded and `while`
    // loops. A band further than one spacing away cannot reach this pixel,
    // because waveAmp stays below half a band.
    for (int b = -1; b <= 1; b++) {
        float band = bandIndex + float(b);
        float slotIndex = floor(q.x / dotSpacing);

        for (int i = -1; i <= 1; i++) {
            float slot = slotIndex + float(i);

            // The dot's own x decides where its band sits, so dots ride the
            // wave rather than being sampled off it.
            float dotX = (slot + 0.5) * dotSpacing;
            float dotY = (band + 0.5) * bandSpacing + ribbonWave(dotX, band, clock, waveAmp);

            float d = length(q - float2(dotX, dotY));

            // Per-dot size and brightness variation, so a band reads as
            // hand-placed rather than as a printed dotted line.
            float character = ribbonHash(float2(slot, band));

            // A brightness wave travelling ALONG the band is what makes the
            // sash look like it is being drawn rather than merely wobbling.
            float travel = 0.55 + 0.45 * sin(dotX * 2.1 - clock * 1.3 + band * 0.9);

            float radius = dotRadius * (0.65 + 0.7 * character);
            float weight = travel * (0.55 + 0.45 * character);

            // Soft halo for the field's overall glow, plus a tighter core so
            // each dot stays legible as a point instead of dissolving.
            glow += (1.0 - smoothstep(0.0, radius * 2.2, d)) * 0.42 * weight;
            cores += (1.0 - smoothstep(0.0, radius, d)) * weight;
        }
    }

    // Slow collective breathing, so a still frame and a moving one differ.
    float breathe = 0.90 + 0.10 * sin(clock * 0.4);
    glow *= breathe;
    cores *= breathe;

    float amplitude = mix(0.45, 1.0, energy);

    // Warmth is authored, not remapped: no field in this lineage has a native
    // warmth concept (docs/shader-abi.md), so the palette is original work.
    float3 cool = float3(0.34, 0.52, 0.82);
    float3 warm = float3(0.90, 0.55, 0.28);
    float3 tint = mix(cool, warm, warmth);

    // Cores lift toward white so the brightest dots read as light rather than
    // as saturated colour — but only partway. Lifting them 60% of the way, as
    // a first pass did, bleached the palette badly enough that a full warmth
    // sweep moved the image by only 1.6/255: technically observable, visually
    // nothing. At 0.3 the dots still read as light and warmth actually tells.
    float3 col = tint * glow * 1.15 + mix(tint, float3(1.0), 0.32) * cores * 1.05;
    col *= amplitude;

    // Grain, matching the house convention in the other fields.
    float grain = ribbonHash(p * 700.0 + clock * 11.0);
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
constant float ORB_CORE_ALPHA = 0.42;

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
