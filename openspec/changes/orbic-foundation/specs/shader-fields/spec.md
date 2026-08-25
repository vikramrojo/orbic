## ADDED Requirements

### Requirement: Three built-in fields ship in v1

The library SHALL ship three selectable built-in fields: Chladni Resonance, Silk Cascade, and Shifting Veils. No bespoke brand field SHALL be authored for v1. A Phyllotaxis field SHALL NOT ship in v1.

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
