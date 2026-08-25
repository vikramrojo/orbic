## ADDED Requirements

### Requirement: Surface public API

The Surface SHALL expose `field`, `preset`, and `scale`, plus per-channel overrides. It SHALL NOT expose `state`, any spring configuration, or any animation option.

#### Scenario: Preset sets channels statically

- **WHEN** a Surface is given `preset="cooling"`
- **THEN** all four channels are set to that preset's values once, with no spring interpolation

#### Scenario: Individual channels override the preset

- **WHEN** a Surface specifies a preset and an explicit `warmth`
- **THEN** the explicit value wins and the remaining channels come from the preset

#### Scenario: Surface has no state machine

- **WHEN** the Surface API is inspected
- **THEN** it offers no state transitions, because it is fixed decoration rather than an agent indicator

### Requirement: Surface is always static

A Surface SHALL render a single frame and schedule no ongoing work. No drift or animation mode SHALL be provided.

#### Scenario: No animation loop exists

- **WHEN** a Surface renders
- **THEN** web starts no `requestAnimationFrame` loop, Skia does not redraw, and SwiftUI uses no `TimelineView`

#### Scenario: Many surfaces cost no per-frame work

- **WHEN** a screen mounts eight Surfaces
- **THEN** each renders once and no per-frame work is scheduled for any of them

#### Scenario: Animated-content hygiene does not apply

- **WHEN** a Surface scrolls offscreen or its tab is hidden
- **THEN** no pausing logic is required, because there is no loop to pause

### Requirement: Surface never intercepts pointer input

A Surface is decorative and sits behind content. It SHALL NOT absorb taps, clicks, or hit-testing on any platform.

#### Scenario: Taps pass through to content above

- **WHEN** a Surface is placed behind a button and the button is tapped
- **THEN** the button receives the event

#### Scenario: Skia canvases do not swallow touches on React Native

- **WHEN** a Surface renders on React Native
- **THEN** its Skia canvas is marked `pointerEvents="none"`, because Skia canvases absorb touches natively without bubbling to the responder system — a decorative background would otherwise silently kill every control drawn over it

#### Scenario: Web and Swift equivalents

- **WHEN** a Surface renders on web or SwiftUI
- **THEN** it sets `pointer-events: none` or `.allowsHitTesting(false)` respectively

### Requirement: Surface preserves text legibility

The surface compositor SHALL damp contrast, reduce octave count, and attenuate high-frequency grain relative to the orb compositor.

#### Scenario: Grain is attenuated

- **WHEN** a field containing per-pixel hash grain is rendered through the surface compositor
- **THEN** the grain is measurably reduced compared to the same field through the orb compositor, so it does not fight text antialiasing

#### Scenario: Legibility is measured, not judged

- **WHEN** each field and preset combination is evaluated
- **THEN** the contrast ratio between the surface's brightest rendered luminance and the specified body-text colour is computed, and the combination is accepted only at 4.5:1 or better (WCAG AA for normal text), measured against the brightest pixel rather than the mean so a bright hotspot cannot pass on average

#### Scenario: The field must remain perceptible

- **WHEN** a Surface is rendered at any preset
- **THEN** its rendered luminance range MUST span at least a defined minimum, so the field is visibly present. A contrast floor alone is satisfied vacuously by a near-black surface, which passes legibility while destroying the shared-material claim the Surface exists to make.

#### Scenario: The field must be identifiable

- **WHEN** two different fields are rendered as Surfaces at the same preset
- **THEN** they MUST be distinguishable from one another, since a Surface that cannot be told apart from another field is not carrying the material

#### Scenario: No centred focal point

- **WHEN** a Surface is rendered at a wide aspect ratio
- **THEN** the mean luminance of the central region MUST NOT exceed the mean luminance of the outer regions by more than a small factor, because a radial falloff produces a stranded blob floating in an otherwise empty card

#### Scenario: Legibility regressions are caught automatically

- **WHEN** a field or the surface compositor changes
- **THEN** the contrast check runs in CI over all field × preset combinations, so a regression fails the build rather than relying on a human noticing

#### Scenario: Unknown preset or field name falls back rather than failing

- **WHEN** an unrecognised `preset` or `field` name is supplied
- **THEN** the component emits a warning naming the unknown value and the valid options, falls back to the `subtle` preset or the first shipped field respectively, and continues rendering

### Requirement: Surface shares the orb's material

A Surface and an Orb using the same field SHALL read as the same material.

#### Scenario: Field swap changes both shapes

- **WHEN** the field is changed on both an Orb and a Surface
- **THEN** both change together, confirming the material is shared rather than duplicated

#### Scenario: Surface is the material seen from further away

- **WHEN** a Surface renders with its default scale
- **THEN** it shows the same field at a larger world-space scale than the Orb, with feature size preserved

#### Scenario: Surface needs no animation dependency

- **WHEN** a consumer uses `<Surface>` on React Native without `<Orb>`
- **THEN** the component renders without `react-native-reanimated` installed
