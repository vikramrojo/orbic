## Context

`/Users/vikramojo/Git/orbic` is greenfield — only `openspec/` exists. Orbic must ship one visual system to three runtimes with genuinely different shading stacks:

| | Web | React Native | Swift |
|---|---|---|---|
| Language | GLSL ES 3.00 | SkSL | MSL (`[[stitchable]]`) |
| Entry point | `void main()` → `out vec4` | `half4 main(float2)` | `half4 fn(float2, half4, …)` |
| Uniform access | globals | globals | **function arguments** |
| Preprocessor | full | limited | full (C++) |
| Runtime compile from string | yes | yes | **no** (via SwiftUI) |

The preprocessor row is why directives are banned from the shared core: the three differ in capability and semantics, so permitting them would introduce platform-specific branches into a source that must be identical everywhere. Preambles are per-platform by construction and may use whatever their target supports. The ban rests on that divergence, not on any claim about a specific target's capabilities.

Two facts from this table drive most of the design. First, SkSL and Metal-stitchable have nearly the same function signature shape and SkSL accepts GLSL `vecN` aliases, so GLSL is the outlier on entry point rather than the middle child — a shared shader core is more achievable than it first appears. Second, uniforms are globals in two languages and arguments in the third, which is irreconcilable *at the uniform level* and therefore has to be designed around rather than papered over.

The library must also satisfy two visual jobs at once: a small, punchy, animated orb, and a wide, quiet, static card background that sits under body text without hurting legibility. These have opposite requirements for contrast, detail and hotspots, but must read as the same material.

## Goals / Non-Goals

**Goals:**
- One authored shader file targets three shading languages without a compiler or transpiler.
- Swapping the material reskins every shape on every platform, by construction rather than by convention.
- The same orb transition looks numerically identical on web, native and Swift.
- A `<Surface>` remains legible under real body text at the smallest supported size.
- Shader authors outside the project can ship a custom field.

**Non-Goals:**
- Runtime shader compilation on any platform.
- Bloom or any multi-pass post-processing.
- Audio reactivity.
- A generic uniform escape hatch.
- A Phyllotaxis field in v1.
- Any animated `<Surface>` mode.
- Supporting Swift below iOS 17 / macOS 14.

## Decisions

### 1. Split the shader into `field()` (material) and `composite()` (shape)

Two shapes each owning a full shader would make brand unity a maintenance discipline — two files that must be kept looking related forever, drifting the first time one is tuned. Cutting one layer lower makes it structural: swap `field`, and both shapes reskin together.

*Alternatives:* one shader per shape (rejected: guaranteed drift); one shader with a `shape` branch inside (rejected: branches on every pixel, and the orb/surface tuning genuinely diverges).

### 2. The shader core declares zero uniforms

`field()` and `composite()` are pure functions taking explicit parameters. Uniform declaration and plumbing lives entirely in per-platform preambles and epilogues. This is precisely what dissolves the globals-vs-arguments split from the Context table, and it is what reduces the build step to string concatenation.

*Alternatives:* declare uniforms in the core and rewrite them per target (rejected: Metal cannot express them as globals at all, so no rewrite exists).

### 3. Aspect-preserving world space, not normalized UV

`field()` receives `p = (fragCoord - 0.5·resolution) / min(resolution.x, resolution.y) · scale`. Dividing by `min()` rather than per-axis keeps noise features square. Each epilogue maps its own geometry in: the orb at small scale (a unit disc), the surface at larger scale (zoomed out).

This is load-bearing rather than cosmetic. Of the three fields being ported, one already uses this convention, one uses per-axis `vec2(aspect, 1.0)` which stretches, and one is not centred at all. (Phyllotaxis, the deferred fourth, has no fragment shader at all.)

Note the longer axis **reveals more field** rather than clipping: at 400×180, `p.x` spans ±1.11 while `p.y` spans ±0.50. A field must therefore read as an extended material and cannot rely on composition centred at the origin. Fed normalized UV, a 400×180 card turns circular features into ovals and the two shapes visibly stop being the same material.

*Alternatives:* normalized UV per shape (rejected: distorts); per-axis aspect correction (rejected: distorts differently at each aspect ratio).

### 4. Frozen four-channel ABI with no escape hatch

`energy`, `coherence`, `warmth`, `pulse`, plus `t`. `coherence` drives domain-warp turbulence *inside* the field, while the sphere mask stays the orb compositor's business — which is what keeps all four channels meaningful on a shape that has no sphere.

A fixed contract means custom shaders can only be reskins. That is the accepted trade: it is what makes "swap the field, both shapes reskin" a guarantee instead of a hope. Because the ABI is unchangeable once third-party shaders exist, it is gated behind an explicit validation exercise (below) before being declared frozen.

*Alternatives:* fixed channels plus generic `float[8]` (deferred, not rejected — revisit only once the three shipped fields prove four channels too tight).

### 5. Build-time concatenation, not a compiler

Build output is `preamble[target] + field + compositor[shape] + epilogue[shape][target]`, plus a Metal type-alias table (`vec2`→`float2`, `mat2`→`float2x2`). SkSL needs no rewrites at all.

*Alternatives:* glslang + SPIRV-Cross (rejected: heavy toolchain, and SkSL is not a SPIRV-Cross target so the RN path still needs hand-adaptation); a restricted-language parser emitting three backends (rejected: a compiler is a project, not a build step); three hand-written files per field (rejected: 9 files for three fields, growing with every field added, and guaranteed to diverge).

### 6. `oMod` / `oAtan2` shims rather than text rewrites

The core is banned from `mod()` and two-argument `atan()`; each preamble defines shims natively. A `mod`→`fmod` regex would be actively dangerous: the two disagree on negative operands, and every field is centred on the origin, so half of each shader's domain is negative. That rewrite fails silently rather than loudly.

Validated against six radiant fields: the only trips across the entire set are Chladni's `mod` (×2) and `atan(y,x)` (×1). No textures, no `discard`, no `while`, and every `for` loop bounded. The shim list is exactly the right length.

### 7. Build-time-only custom shaders

Web and Skia both compile shader strings at runtime happily. SwiftUI's `ShaderLibrary` loads only from the bundle's default library or a compiled `.metallib` — there is no `ShaderLibrary(source:)`. Supporting runtime shaders would mean abandoning `.colorEffect` for a hand-owned `CAMetalLayer` renderer: weeks instead of days, and ownership of the render loop, drawable sizing and lifecycle.

*Alternatives:* runtime on web/native and build-time on Swift (rejected: an asymmetric capability leaks into the type signatures of all three bundles).

### 8. Personality as data, with a hand-rolled spring in all three languages

`presets.json` is the single source of truth; per-transition spring overrides are where character lives (`subtle→active` snaps awake, `active→subtle` sighs out). Swift cannot import TypeScript, so the *data* is shared and the integrator is reimplemented — roughly 20 lines each.

### Shipped baseline

| Preset | energy | coherence | warmth | pulse |
|---|---|---|---|---|
| `subtle` | 0.15 | 0.82 | 0.35 | 0.30 |
| `cooling` | 0.30 | 0.74 | 0.12 | 0.55 |
| `warming` | 0.55 | 0.60 | 0.90 | 0.75 |
| `active` | 0.88 | 0.52 | 0.55 | 1.40 |
| `pacing` | 0.48 | 0.68 | 0.50 | 2.00 |

Springs carry `stiffness`, `damping` and **`mass`** — mass was not in the original design and was added during implementation; it earns its place because `active>subtle` at mass 1.2 is how "sighs out" is expressed. `default` is `{120, 14, 1.0}`; eight transitions carry explicit overrides and the remaining twelve fall back.

Two integration constants are part of the shared contract and are carried in the golden-frame fixture metadata so no platform can silently pick its own: `fixedSubstep` (1/120 s) and `maxFrameDelta` (0.25 s). The latter exists because an unbounded accumulator turns a resumed background tab into 7200 substeps in a single call; clamping identically on every platform is what keeps the conformance guarantee intact.

### ABI gate results (task 3.x)

Six radiant fields were analysed. Every one has exactly two bespoke uniforms, and one of the two is always a time multiplier:

| Field | speed → `pulse` | magnitude → |
|---|---|---|
| Chladni Resonance | `u_modeSpeed` | `u_complexity` → `coherence` (inverted) |
| Silk Cascade | `u_flowSpeed` | `u_sheenIntensity` → `energy` |
| Shifting Veils | `u_layerSpeed` | `u_layerCount` → `coherence` (inverted) |
| Aurora Veil | `u_auroraSpeed` | `u_auroraIntensity` → `energy` |
| Silk Groove | `u_flowSpeed` | `u_foldDepth` → `coherence` (inverted) |
| Stardust Veil | `u_driftSpeed` | `u_starDensity` → `coherence` (inverted) |

Two were disambiguated by reading the maths rather than trusting the name: `u_sheenIntensity` is passed as specular strength into three `shadeLayer` calls at 0.7/0.9/1.0 weights, so it is amplitude; `u_complexity` multiplies Chladni mode numbers to yield higher-order nodal patterns, so it is structure.

**The gate passes, but inverts the original worry.** Four channels are not too tight — source fields only ever use *two* axes, a speed and a magnitude. The contract is generous. Two findings follow:

- **`warmth` is native in 0 of 6.** No radiant field has any warmth concept; all hardcode palettes as literal `vec3` constants. Warmth is purely Orbic-imposed, so every field port includes original palette authoring rather than uniform remapping. Anyone estimating a port as mechanical will be wrong here specifically.
- **`pulse` is inert on a `<Surface>`.** Every field uses it solely as a time multiplier, and a rate is only observable across frames while a Surface renders exactly one. Three of the four channels do something on a Surface, not four.

**The gate is now closed, and it revised one of the findings above.** All six fields analysed came from pbakaus/radiant and therefore shared uniform conventions, so they agreed with each other because of a common ancestor rather than because the contract generalises. Task 3.5 tested it against a field from the Shadertoy/Inigo Quilez cellular-noise tradition (`gate-3.5/cellular-drift.orb`, built through the shipped `orbic build-shader` CLI, compiled on real Metal and real Skia, then swept channel by channel — `gate-3.5/findings.md` has the numbers).

It passes: three of four channels are observable on both shapes, and the one bug found was in the fields rather than the contract — `pulse` was being applied twice, making the effective clock rate `pulse²`, which both platforms got identically wrong and therefore never caught.

But it **overturns "four channels are not too tight"**. That conclusion was an artefact of the sample. Radiant fields wanted one structural axis; the cellular field wants three independent ones — density, jitter and edge sharpness — and `coherence` is the only structural channel there is. All three had to be bound to a single hand-chosen curve, which makes that field's "sparse but ragged" and "dense but crisp" corners unreachable through the ABI. Nothing is broken, but `coherence` is a **lossy projection** of whatever structural axes a field actually has, not a roomy one. A field author with more than one structural idea must pick a curve through them.

The `warmth` finding, by contrast, got stronger: this tradition also hardcodes palettes as literal constants, so warmth is Orbic-imposed across two independent lineages, not just radiant's.

Reanimated's `withSpring` is deliberately **not** used. Its formulation and rest threshold differ from a hand-rolled integrator and from any Swift equivalent, so the three platforms would visibly disagree on exactly the transitions that are the product. Instead: semi-implicit Euler with fixed 1/120 s substeps accumulated against real frame delta — frame-rate independent and numerically comparable.

Because Reanimated is therefore only *transport* — keeping per-frame uniform writes off the JS thread — it is an **optional peer dependency, required only by `<Orb>`**. `<Surface>` is static and needs none of it, so a Surface-only consumer installs 9.7 MB of Skia rather than 14.3 MB. Without Reanimated, `<Orb>` falls back to a JS-thread rAF pump: functional, but it degrades exactly where reactivity matters, since a busy JS thread delays the spring updates that make a mid-flight retarget feel responsive. Documented as a degradation, not a supported equivalence.

### 9. `<Surface>` is always static — no drift mode

Not primarily a performance decision, though a dashboard holding one Orb and eight Surfaces would be ~25× the fragment cost of the Orb alone. It is a simplification on every platform: web renders one frame and never starts rAF, Skia simply does not redraw, and SwiftUI needs no `TimelineView`. It is also already the reduced-motion fallback, so that path comes free.

An opt-in slow `drift` was considered and cut. Supporting it would drag the entire animated-content hygiene path — offscreen pausing, hidden-tab pausing, per-frame DPR handling — onto a component whose whole purpose is to sit still behind text, and would reopen the many-surfaces cost question for a motion nobody asked for. Removing the option is worth more than the option.

*Alternatives:* static-by-default with opt-in drift (rejected as above); always-animated (rejected: legibility and cost).

### 10. No bloom; glow is in-shader rim falloff

Skia's `RuntimeEffect` does not do multi-pass the way WebGL does, and SwiftUI `.colorEffect` is strictly single-pass. A real bloom pass would fork the shader core across two shapes and three platforms — six divergent maintenance targets.

### 11. Ship three adapted fields; author no bespoke brand field in v1

Orbic's identity is the compositors plus the personality layer; the field is the consumer's choice. This removes the hardest creative step from v1 and, more usefully, turns three independently-authored shaders into a real stress test of the four-channel ABI.

### 12. Phyllotaxis is deferred past v1

The radiant original is `canvas.getContext('2d')` with `ctx.arc()` and 2000 accumulating points — zero occurrences of `gl_FragCoord`. SwiftUI `.colorEffect` is a pure per-pixel function and cannot express particles, so this is a category mismatch rather than a porting difficulty, and it is the same constraint that rules out bloom.

A stateless replacement is possible — invert Vogel's model (`r = c√i`, `θ = i·137.5°`) and do a bounded nearest-neighbour search, the way a Voronoi shader does — but it is simultaneously the highest-risk item (non-obvious maths, no reference implementation to check against) and the most expensive at runtime: a distance computation per candidate per pixel, where all three other fields are pure noise evaluation. It also loses the trailing quality that gives the original its character, so the expensive version is not even the same effect.

Deferred rather than cancelled. Because fields ship as separate entry points, adding a fourth later costs existing consumers nothing.

*Alternatives:* ship it in v1 (rejected: highest risk and cost, lowest confidence); port the particle system (impossible on `.colorEffect`).

### 13. Monorepo with `Package.swift` at the repo root

SPM strongly prefers root, and subpath references are handled badly by some tooling. Generated `.metal` files and `Presets.swift` are **committed**, because SPM consumers cannot run a Node build step; CI regenerates and diffs to prevent drift.

### 14. No Three.js / React Three Fiber

Roughly 600 KB to draw a single quad whose fragment shader is hand-written. R3F earns its weight with a scene graph; one orb is not a scene graph. Raw WebGL2 instead, with one shared context process-wide and shaders compiled once.

## Risks / Trade-offs

**The four-channel ABI may not fit three independent fields** → Gated: before any shader work, map every field's bespoke uniforms (`u_modeSpeed`/`u_complexity`, `u_flowSpeed`/`u_sheenIntensity`, `u_layerSpeed`/`u_layerCount`) onto the four channels on paper and decide each field's `warmth` story. None of the ported fields has a native warmth concept; all ship fixed palettes, so this is creative work, not mechanical. Freeze the ABI only on passing. Note the sample shrank from four fields to three when Phyllotaxis was deferred, which slightly weakens the test — a fourth field added later may yet strain the contract.

**Three spring implementations drift and the platforms become different products** → Golden-frame fixture asserted in Vitest and XCTest at ±0.001 across every preset-to-preset transition. Treated as a v1 requirement, not a nicety: it is the only mechanism making "same orb everywhere" true rather than aspirational.

**Fields distort at non-square aspect ratios** → The world-space convention plus an explicit regression test rendering each field at 400×180, 180×400 and 300×300. All three ported fields arrive using a different coordinate convention, and two of the three are outright broken for non-square targets.

**Surfaces hurt text legibility** → All three ported fields add per-pixel `hash(gl_FragCoord)` grain, which fights text antialiasing directly. The surface compositor must attenuate grain and reduce octaves, tuned with real body text on screen. Acceptance criterion is legibility, not appearance. Tuning matrix is 3 fields × 5 presets = 15 manual combinations.

**Generated artifacts drift from source** → CI reruns both generators and fails on a non-empty `git diff`.

**Shader artifacts bloat consumer bundles** → Measured, and small: the three fields are 1.3 KB, 2.7 KB and 2.3 KB gzipped. Fields ship as separate entry points (`@orbic/web/fields/silk`) so importing one does not pull three. Swift bundles all into one metallib, which is fine.

**React Native's dependency floor dwarfs the library** → Skia is 9.7 MB unpacked against roughly 5 KB of Orbic, and there is no lighter way to run real shaders on RN — expo-gl is Expo-coupled and react-native-wgpu is immature. Mitigated only partially, by making Reanimated optional so Surface-only consumers avoid a further 4.6 MB. Documented honestly: if an app does not already use Skia, the native bundle is not a light choice.

**Mobile `half`/`mediump` precision degrades long-running animation** → `t` wraps at 3600 s.

**MIT attribution obligations** → `NOTICE` file, README credit, and a provenance header comment in every ported field.
