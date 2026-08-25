## ADDED Requirements

### Requirement: Two-function shader contract

The system SHALL define exactly two authored shader functions: `field()`, supplying the material, and `composite()`, supplying the shape. A field SHALL be usable by every compositor without modification.

```glsl
vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse);
vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse);
```

#### Scenario: Field is shape-agnostic

- **WHEN** a field file is built against both the orb and surface compositors
- **THEN** both artifacts compile from the identical unmodified field source

#### Scenario: Compositor returns premultiplied colour and alpha

- **WHEN** the orb compositor evaluates a point outside the sphere mask
- **THEN** it returns an alpha of 0 so the orb composites over arbitrary backgrounds

### Requirement: Shader cores declare no uniforms

Authored field and compositor files SHALL NOT declare any `uniform`. All uniform declaration and plumbing SHALL live in per-platform preambles and epilogues.

#### Scenario: Uniform declaration in a field is rejected

- **WHEN** a field source containing `uniform float u_time;` is linted
- **THEN** the lint fails with an error naming the offending declaration

#### Scenario: Metal receives uniforms as arguments

- **WHEN** the Metal epilogue is generated
- **THEN** it passes uniforms as `[[stitchable]]` function arguments while the GLSL and SkSL epilogues read them as globals, from the same unmodified core

### Requirement: Aspect-preserving world-space coordinates

Fields SHALL receive an aspect-preserving world-space point computed as `p = (fragCoord - 0.5 * resolution) / min(resolution.x, resolution.y) * scale`. Normalisation SHALL use `min()` of both axes, never per-axis division.

#### Scenario: Feature size is constant across aspect ratios

- **WHEN** the same field is rendered at 400×180, 180×400 and 300×300 and the central 180×180 pixel region is compared across all three
- **THEN** those regions are pixel-identical within a mean absolute difference of 1/255 per channel, since `min()` normalisation makes the shorter axis the shared unit in every case

#### Scenario: The longer axis reveals more field rather than stretching it

- **WHEN** a field is rendered at 400×180
- **THEN** `p.x` spans ±1.11 while `p.y` spans ±0.50, so the wide axis shows more of the field; a field MUST therefore read as an extended material and MUST NOT rely on composition centred at the origin

#### Scenario: Orb and surface differ by scale alone

- **WHEN** the orb and surface epilogues map their geometry into world space
- **THEN** they differ only in the `scale` factor applied, not in the normalisation formula

### Requirement: Frozen four-channel uniform ABI

The public uniform contract SHALL be exactly `t`, `energy`, `coherence`, `warmth`, and `pulse`. No generic escape-hatch channel SHALL be provided in v1. `coherence` SHALL drive turbulence within the field, not the orb's sphere mask.

#### Scenario: All four channels are meaningful on both shapes

- **WHEN** `coherence` is varied on a surface, which has no sphere
- **THEN** the field's domain-warp turbulence changes visibly, from turbulent to smooth

#### Scenario: ABI is validated before freezing

- **WHEN** the ABI mapping exercise is run against all three shipped fields
- **THEN** every field's bespoke uniforms map onto the four channels and each field's `warmth` behaviour is defined, before the contract is declared frozen

#### Scenario: Validation includes a field from an unrelated source

- **WHEN** the ABI mapping exercise is run
- **THEN** it additionally covers at least one field originating outside pbakaus/radiant, because fields from one codebase share uniform conventions and would not exercise the contract independently

#### Scenario: pulse is inert on a static Surface

- **WHEN** `pulse` is varied on a `<Surface>`
- **THEN** the rendered output is unchanged, because `pulse` is a rate multiplier and a rate is only observable across frames, while a Surface renders exactly one

#### Scenario: Time wraps to protect precision

- **WHEN** `t` reaches 3600 seconds
- **THEN** it wraps to 0

#### Scenario: Fields do not assume continuity across the wrap

- **WHEN** a field evaluates `t` immediately before and immediately after a wrap
- **THEN** it MUST tolerate a discontinuity, because no wrap point can be continuous for an arbitrary field: a field containing `sin(t * 0.7)` yields `sin(2520)` before the wrap and `sin(0)` after, and these are not equal for any wrap period that is not commensurate with every frequency the field uses

#### Scenario: The wrap is deferred until it cannot be observed

- **WHEN** `t` would wrap while the component is visible and animating
- **THEN** the renderer SHALL defer the wrap until the component is paused, offscreen, or hidden — all of which it already tracks — so the discontinuity is never observed. Deferral is safe because `float` retains sub-millisecond resolution well beyond 3600 seconds.

### Requirement: Portable subset enforcement

Authored shader cores SHALL be restricted to a portable subset: no texture sampling, no `discard`, no unbounded or `while` loops, no dynamic array indexing, and no preprocessor directives. Directives are banned because the three targets' preprocessors differ in capability and semantics, so permitting them would introduce platform-specific code paths into what must be a single shared source. Preambles, which are per-platform by construction, may use whatever their target supports.

#### Scenario: Non-portable construct is rejected

- **WHEN** a field using `discard`, `while`, `sampler2D`, or `#define` is linted
- **THEN** the lint fails and names the specific banned construct

#### Scenario: Bounded loops are permitted

- **WHEN** a field contains `for (int i = 0; i < 7; i++)`
- **THEN** the lint passes, because the bound is a compile-time constant

### Requirement: Divergent builtins are shimmed, not rewritten

The portable subset SHALL ban `mod()` and two-argument `atan()`, providing `oMod(x, y)` and `oAtan2(y, x)` shims defined natively in each platform preamble. The build SHALL NOT perform a `mod`→`fmod` text substitution.

#### Scenario: Bare mod is rejected

- **WHEN** a field calls `mod(a, b)` directly
- **THEN** the lint fails and directs the author to `oMod`

#### Scenario: Shim preserves GLSL semantics on negative operands

- **WHEN** `oMod(-1.5, 6.0)` is evaluated on each of the three platforms
- **THEN** all three return the GLSL result of 4.5, not Metal's `fmod` result of -1.5
