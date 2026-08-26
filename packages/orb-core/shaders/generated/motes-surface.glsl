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

// Motes — drifting points of light, with no hard edge of their own.
//
// The other three shipped fields are continuous materials: interference
// patterns, fabric folds, layered veils. This one is made of discrete points,
// which is a different family of look — closer to dotted "thinking orb"
// indicators than to a woven surface.
//
// STRUCTURE: A CELL LATTICE, NOT A FIXED CLUSTER
//
// The obvious way to draw N points is to hash N positions and loop over them.
// That is wrong here. World space is unbounded, and a Surface reveals more of
// it along its long axis (docs/shader-abi.md), so a fixed set of points near
// the origin reads as a stranded cluster floating in emptiness — the exact
// failure the world-space note warns about, and the same reason chladni.orb
// dropped its bounded "plate".
//
// Instead the plane is divided into cells, each cell owns exactly one mote,
// and each pixel only examines its own cell plus the eight around it. That
// covers the plane at any size or aspect AND bounds the per-pixel work by
// construction, since a mote more than one cell away cannot reach this pixel.
// The 3x3 neighbourhood is the same shape cellular-drift.orb used in the task
// 3.5 ABI gate.
//
// COST: 9 cells x (1 hash for the mote's phase + 1 for its character) plus
// trig per cell, so roughly 20 hashes per field() call — between chladni
// (~3) and silk (~72), and far under veils (~700, which ships). Note
// surface.orb calls field() five times per pixel, so a Surface pays ~100;
// it renders once, and the animated orb's single call is the binding budget.
//
// Portable subset throughout: constant-bound `for` loops only, no arrays (so
// no dynamic indexing), no `mod`/two-arg `atan`, no textures, no `discard`.

float moteHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Where a cell's mote sits at time `clock`, in cell-local coordinates.
//
// Each mote travels its own small ellipse rather than drifting linearly:
// linear drift would make the whole lattice visibly slide in one direction,
// which reads as a scrolling texture instead of as motes hanging in space.
vec2 motePosition(vec2 cell, float clock, float travel) {
    float a = moteHash(cell) * 6.2831853;
    float b = moteHash(cell + 41.7) * 6.2831853;
    // Per-mote rate, so they do not orbit in lockstep.
    float rate = 0.35 + 0.5 * moteHash(cell + 7.3);
    return cell + 0.5 + vec2(sin(a + clock * rate), cos(b + clock * rate * 0.8)) * travel;
}

vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    // `t` already carries `pulse` and the component's `speed`
    // (docs/shader-abi.md); multiplying again would apply it twice.
    float clock = t;

    // THE SINGLE STRUCTURAL AXIS.
    //
    // This field naturally wants several independent controls — how many
    // motes, how large, how soft, how far they wander. The ABI provides one
    // structural channel, so all four ride one hand-chosen curve, exactly the
    // strain recorded in gate-3.5/findings.md. High coherence is an ordered
    // sparse constellation of tight points; low coherence is a dense, soft,
    // restless swarm. The combinations off that curve — "sparse and soft",
    // "dense and tight" — are simply unreachable through this ABI, and that
    // is a property of the contract, not an oversight here.
    float density = mix(9.0, 4.5, coherence);
    float moteSize = mix(0.30, 0.16, coherence);
    float softness = mix(1.0, 0.45, coherence);
    float travel = mix(0.42, 0.16, coherence);

    vec2 scaled = p * density;
    vec2 base = floor(scaled);

    float glow = 0.0;
    float cores = 0.0;

    // Constant bounds: the portable subset forbids unbounded and `while`
    // loops. A mote outside this neighbourhood cannot reach the pixel,
    // because `travel` stays below half a cell.
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 cell = base + vec2(float(i), float(j));
            vec2 pos = motePosition(cell, clock, travel);
            float d = length(scaled - pos);

            // Per-mote size variation, so the field does not read as a
            // regular grid of identical dots.
            float character = moteHash(cell + 19.1);
            float radius = moteSize * (0.55 + 0.9 * character);

            // Two-part falloff: a soft halo that overlaps its neighbours and
            // gives the field its glow, plus a tighter core that keeps each
            // mote legible as a point rather than dissolving into the haze.
            glow += (1.0 - smoothstep(0.0, radius * (1.0 + softness * 2.2), d)) * 0.55;
            cores += (1.0 - smoothstep(0.0, radius * 0.42, d)) * (0.5 + 0.5 * character);
        }
    }

    // Slow collective breathing, so a still frame and a moving one differ.
    float breathe = 0.92 + 0.08 * sin(clock * 0.35);
    glow *= breathe;

    float amplitude = mix(0.22, 1.0, energy);

    // Warmth is authored, not remapped: no source field in this lineage has a
    // native warmth concept (docs/shader-abi.md), so the palette is original
    // work every time.
    vec3 cool = vec3(0.30, 0.48, 0.78);
    vec3 warm = vec3(0.88, 0.52, 0.26);
    vec3 tint = mix(cool, warm, warmth);

    // Cores are lifted toward white so the brightest points read as light
    // rather than as saturated colour, while the halo carries the hue.
    vec3 col = tint * glow * 0.5 + mix(tint, vec3(1.0), 0.55) * cores * 0.42;
    col *= amplitude;

    // Grain, matching the house convention in the other fields.
    float grain = moteHash(p * 700.0 + clock * 11.0);
    col += (grain - 0.5) * 0.01;

    return clamp(col, 0.0, 1.0);
}


// Real surface compositor (task 6.4): a full-bleed, always-static
// background that must recede behind body text rather than draw attention
// to itself (see docs/shader-abi.md and design.md's "two visual jobs at
// once" framing). Two mechanisms, each doing one job:
//
//   1. A small multi-tap spatial average of `field()` — NOT a second
//      render pass (there is still exactly one fragment shader invocation
//      per pixel; this just calls the same portable `field()` a few more
//      times at nearby world-space offsets and averages the results), so
//      it doesn't fork the shader core the way a real bloom/blur pass
//      would (see design.md decision #10 on why multi-pass is rejected).
//      This is the *only* way this file can achieve "octave/detail
//      reduction" at all: composite() has no access to field()'s internal
//      noise octaves, so the only lever available from this side of the
//      contract is spatial averaging, which low-pass-filters whatever
//      detail field() produced. The same averaging also attenuates
//      per-pixel hash grain, since nearby grain samples are decorrelated
//      and their average trends toward the grain's mean — one mechanism
//      serving both the "octave/detail reduction" and "grain attenuation"
//      requirements in specs/surface-component/spec.md.
//   2. Contrast damping — the blurred colour is pulled toward a fixed dark
//      anchor tone, compressing the field's dynamic range.
//
// A Surface is static (rendered once, never re-evaluated per frame — see
// design.md decision #9), so the extra `field()` evaluations here are a
// one-time cost, not a per-frame one; this trade would not be acceptable
// in the animated orb compositor and is not made there.
//
// Returns PREMULTIPLIED colour and alpha (`vec4(rgb * a, a)`), per the
// two-function contract in docs/shader-abi.md. Alpha is always 1.0 here —
// a Surface is a full-bleed background, not a masked shape — but it is
// still returned premultiplied so both compositors obey one convention.
//
// --- Luminance band (tuned against real renders — see handback) ---------
// specs/surface-component/spec.md requires TWO things about brightness,
// not one, and they bound this from opposite sides:
//   - a CEILING: WCAG AA 4.5:1 between this compositor's *brightest*
//     rendered luminance and the body-text colour, checked against the max
//     rather than the mean, so one hotspot can't pass on a good average.
//   - a FLOOR ("the field must remain perceptible"): rendered luminance
//     range must span at least a defined minimum, because a contrast
//     floor alone is satisfied vacuously by a near-black surface — that
//     passes legibility while destroying the entire premise that a
//     Surface is the Orb's material seen from further away.
//
// A single LINEAR mix toward a fixed anchor tone (an earlier version of
// this file used `mix(base, blurred, contrast)`) cannot satisfy both at
// once, because the shipped fields' own post-blur brightest points are far
// apart: measured directly (bypassing this file's damping), Veils peaks
// around 0.18-0.28, while Chladni and Silk's brightest presets reach
// 0.82-0.92 -- almost the full [0,1] range field() is allowed to use. Any
// single linear (base, contrast) pair that lifts Veils to something
// visible pushes Chladni/Silk's already-bright peaks straight past the
// WCAG ceiling (measured: contrast 0.62 lifted Veils to a visible ~13:1,
// but put Chladni's brightest preset at 3.09:1, failing the 4.5:1 floor
// outright). And a pair chosen to keep Chladni safe leaves Veils at
// visually-black RGB(30,31,35) -- the over-damping this section originally
// shipped with.
//
// So this compresses instead of linearly mixing: a Reinhard-style knee,
// `gained / (1 + gained * SURFACE_KNEE)`, which behaves close to linear
// for small inputs (so dim background areas between veils/folds keep their
// own relative detail — the "range" the perceptibility floor cares about)
// but compresses hard as input grows, pulling bright fields' peaks down
// disproportionately more than dim fields' peaks. `SURFACE_GAIN` and
// `SURFACE_KNEE` were solved from two real measured points -- Veils'
// dimmest realistic peak (~0.20) and Chladni/Silk's brightest (~0.90) --
// so that both land inside a visible-but-safe band (~0.22 and ~0.35 in
// output-channel terms respectively, roughly 7-12:1 against white body
// text) rather than one of them sitting at either extreme. See
// tools/render-check/contrast-check.mjs's `checkPerceptibility` for the
// floor, `checkContrast` for the ceiling, and its printed table for the
// current measured range of every field x preset combination.

const float SURFACE_GAIN = 2.3;
const float SURFACE_KNEE = 2.4;

// World-space offset for the 5-tap blur, chosen relative to the shipped
// fields' own grain frequency (their grain hashes multiply `p` by roughly
// 600-900) so this radius spans several grain cells rather than sitting
// inside a single one. Provisional: the surface epilogue's own `scale`
// (task 7.x) is not fixed yet, and this constant should be re-checked
// once it is and once a renderer exists to look at the result.
const float SURFACE_BLUR_RADIUS = 0.006;

// Known shape limitation, recorded with the provisional radius above: the
// 5 taps below are the centre plus the four DIAGONAL neighbours, so the
// kernel is diamond-shaped and carries no weight at the axis-aligned
// offsets (+r,0), (-r,0), (0,+r), (0,-r). Detail that runs exactly
// horizontally or vertically is therefore attenuated less than diagonal
// detail of the same frequency. This is accepted for now -- it costs 4
// field() evaluations rather than 8, and the shipped fields' grain is
// isotropic enough that the bias is not visible -- but a 9-tap symmetric
// kernel is the fix if a field ever ships with strong axis-aligned
// structure. Note that widening the kernel changes the post-blur
// brightness, so SURFACE_GAIN and SURFACE_KNEE above would have to be
// re-measured alongside it.

vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
    vec3 c0 = field(p, t, energy, coherence, warmth, pulse);
    vec3 c1 = field(p + vec2(SURFACE_BLUR_RADIUS, SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    vec3 c2 = field(p + vec2(-SURFACE_BLUR_RADIUS, SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    vec3 c3 = field(p + vec2(SURFACE_BLUR_RADIUS, -SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);
    vec3 c4 = field(p + vec2(-SURFACE_BLUR_RADIUS, -SURFACE_BLUR_RADIUS), t, energy, coherence, warmth, pulse);

    vec3 blurred = (c0 + c1 + c2 + c3 + c4) / 5.0;

    // Contrast damping: a Reinhard-style compressive knee (see header) —
    // lifts dim fields toward visibility while compressing bright fields'
    // peaks so they don't blow past the legibility ceiling.
    vec3 gained = blurred * SURFACE_GAIN;
    vec3 damped = gained / (1.0 + gained * SURFACE_KNEE);

    float alpha = 1.0;
    return vec4(damped * alpha, alpha);
}


// Orbic epilogue — surface shape, GLSL ES 3.00.
//
// Maps the fragment coordinate into aspect-preserving world space at
// surface scale (zoomed further out than the orb, so the same noise
// frequency reads as fine grain rather than a few large blobs — see
// docs/shader-abi.md). `u_time` is assumed already wrapped (at 3600 s) by
// the caller.
//
// u_scale is surface-specific — not part of the frozen four-channel ABI
// (energy/coherence/warmth/pulse), which field()/composite() alone see.
// It's plumbing local to this epilogue, the same way any other uniform is
// per design.md decision #2, exposed as the Surface component's public
// `scale` prop (surface-component spec). The renderer defaults it to 3.0,
// matching this file's previous hardcoded SURFACE_SCALE, so omitting the
// prop is behaviourally identical to before this uniform existed.

uniform float u_scale;

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * u_scale;
    oFragColor = composite(p, u_time, u_energy, u_coherence, u_warmth, u_pulse);
}
