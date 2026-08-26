## ADDED Requirements

### Requirement: The built-in field set is open, not fixed

The library SHALL ship a set of selectable built-in fields, enumerated by the build rather than fixed by this spec. No bespoke brand field SHALL be authored for v1. A Phyllotaxis field SHALL NOT ship in v1.

This requirement previously pinned the set at exactly three — Chladni Resonance, Silk Cascade and Shifting Veils. That was already untrue before this change (`ribbons` shipped as a fourth) and pinning a count here turned out to be the wrong shape of rule: every consumer of the list is generated from the fields directory, so the count is an output of the build, not an input to it. What matters is the properties each field must satisfy, which the requirements below state.

#### Scenario: Adding a field requires no edit outside the pipeline

- **WHEN** a `.orb` field is added to `packages/orb-core/shaders/fields/`
- **THEN** it appears in the generated field lists for web, native and Swift, in the example harness, and in the contrast, aspect and brand-unity checks, with no hand-maintained list to update

#### Scenario: Every field must earn its place on both shapes

- **WHEN** a new field is added
- **THEN** it SHALL pass the WCAG AA contrast gate at every preset, hold its central region across aspect ratios, and differ visibly from its neighbours in the brand-unity ring — a field that reads only as an Orb and washes out as a Surface does not qualify

#### Scenario: Field is selected by prop

- **WHEN** a consumer sets `field="silk"` on an Orb or Surface
- **THEN** that field's material is rendered in the requested shape

### Requirement: Ported fields are normalised to the shader contract

Each field adapted from an external source SHALL be normalised before shipping: coordinates converted to the world-space convention, `u_mouse` removed, bespoke uniforms remapped onto the four ABI channels, and a `warmth` response grafted in.

#### Scenario: Divergent source coordinate conventions are unified

- **WHEN** Silk Cascade (per-axis aspect) and Shifting Veils (origin at corner) are ported
- **THEN** both use the shared `min()`-normalised centred world space and neither distorts at non-square aspect ratios

#### Scenario: Mouse input is removed

- **WHEN** any ported field is linted
- **THEN** no reference to a mouse or pointer uniform remains, since it is absent from the ABI and meaningless on a static Surface

#### Scenario: Warmth is grafted onto fixed palettes

- **WHEN** `warmth` is varied on any shipped field
- **THEN** the palette shifts between cool and warm, despite none of the source shaders having a native warmth concept

### Requirement: Fields are tuned against both shapes

A field SHALL be considered complete only when it reads correctly as both an orb and a surface.

#### Scenario: Field validated in both compositors

- **WHEN** a field is reviewed for completion
- **THEN** it is rendered through both compositors side by side and accepted only if both read as the same material

### Requirement: All shipped fields are stateless

Every shipped field SHALL be a pure function of position, time and the four channels, with no accumulation between frames. Effects requiring frame-to-frame state SHALL NOT be shipped.

#### Scenario: Field output depends only on its inputs

- **WHEN** any shipped field is evaluated at time `t`
- **THEN** the output depends only on position, `t` and the four channels, so it renders correctly under SwiftUI `.colorEffect`, which is a pure per-pixel function

#### Scenario: Stateful source effects are excluded

- **WHEN** a candidate field requires particle accumulation or feedback between frames
- **THEN** it is excluded from the shipped set rather than approximated, because no such effect can render on all three platforms

### Requirement: Adding a field later costs existing consumers nothing

Because fields ship as independent entry points, introducing a new field after v1 SHALL NOT change the payload of consumers who do not import it.

#### Scenario: Deferred field can be added without regression

- **WHEN** a fourth field is added in a later release
- **THEN** consumers importing only the original three see no change in bundle size

### Requirement: Third-party attribution is retained

Fields adapted from pbakaus/radiant (MIT) SHALL retain the required copyright notice.

#### Scenario: Attribution is present

- **WHEN** the repository is inspected
- **THEN** a `NOTICE` file, README credit, and a provenance header comment in each ported field are all present
