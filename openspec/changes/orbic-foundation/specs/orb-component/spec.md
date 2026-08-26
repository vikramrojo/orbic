## ADDED Requirements

### Requirement: Orb public API

The Orb SHALL expose `field`, `state`, `size`, `speed`, `paused`, `edge`, and `backlight` with equivalent meaning on all three platforms.

#### Scenario: Equivalent API across platforms

- **WHEN** an Orb is configured with the same field, state and size on web, native and Swift
- **THEN** each platform accepts the same prop names and value types, with no platform-only prop and no differing default

#### Scenario: Speed scales the clock only

- **WHEN** `speed` is set to 2
- **THEN** the animation clock advances twice as fast while channel values and spring behaviour are unchanged

#### Scenario: Unknown state or field name falls back rather than failing

- **WHEN** an unrecognised `state` or `field` name is supplied
- **THEN** the component emits a warning naming the unknown value and the valid options, falls back to the `subtle` preset or the first shipped field respectively, and continues rendering — it does not throw, trap, or render nothing

#### Scenario: Equivalence across platforms is defined numerically

- **WHEN** the same field, state and size are rendered on web, native and Swift and captured at an identical elapsed time
- **THEN** the captures agree within an empirically calibrated mean-absolute-difference threshold, allowing for platform rasterisation differences while catching a genuinely divergent render

#### Scenario: The parity threshold is calibrated, not assumed

- **WHEN** the parity threshold is first established
- **THEN** it is derived by measuring the achievable floor between platforms on an identical field, not chosen in advance; rasterisers genuinely disagree, and a threshold set below the achievable floor produces permanent false failures while one set far above it detects nothing

#### Scenario: Size changes re-render rather than rescale

- **WHEN** `size` changes
- **THEN** the drawing surface is resized and the shader re-evaluated at the new resolution — the previous raster is NOT scaled by a view transform, which would upscale an already-rasterised image and lose sharpness

### Requirement: State changes animate through springs

Setting a new `state` SHALL retarget the channel springs rather than snapping channel values.

#### Scenario: Transition is interpolated

- **WHEN** `state` changes from `subtle` to `active`
- **THEN** channel values move continuously from the old preset to the new one using the transition's spring parameters

#### Scenario: Mid-flight retarget

- **WHEN** `state` changes again before the previous transition settles
- **THEN** the springs retarget from their current values and velocities without discontinuity

### Requirement: Pause halts the clock without unmounting

Setting `paused` SHALL stop clock advancement while leaving the last rendered frame visible.

#### Scenario: Paused orb holds its frame

- **WHEN** `paused` is set to true
- **THEN** the animation stops advancing, the last frame remains on screen, and no per-frame work is scheduled

### Requirement: Orb renders as a transparent sphere over arbitrary backgrounds

The orb compositor SHALL derive alpha from sphere geometry and SHALL produce full transparency outside the silhouette. Any lighting SHALL be produced in-shader, not by a bloom or second pass.

This requirement previously mandated "a sphere mask with rim falloff", with glow produced by that rim. That was implemented as an additive white band just inside a crisply cut edge, and it read as a hard outline stamped onto the background rather than as a lit object. It was replaced, and the replacement's first attempt — a wide soft radial falloff with the rim removed — failed the opposite way: dropping the geometry along with the rim left a blur with no form. The requirement is now written around the sphere's own curvature, which is what both attempts were missing.

#### Scenario: Alpha follows the sphere's curvature

- **WHEN** the orb is composited
- **THEN** alpha is derived from the hemisphere height `sqrt(1 - r^2)`, which is near-flat across the face and falls away at the limb — NOT from a linear or smoothstep radial ramp, which is steepest in the middle and reads as fog rather than as a curved solid

#### Scenario: Grazing-angle response thickens the material, it does not glow white

- **WHEN** a Fresnel term is applied at the limb
- **THEN** it increases the material's DENSITY (alpha) rather than adding to its colour, so the limb reads as glass turning away from the viewer rather than as a bright ring

#### Scenario: Composites over a background

- **WHEN** an Orb is placed over a coloured background
- **THEN** the background shows through outside the orb's silhouette, and also partially through its face, since the core is deliberately not opaque

#### Scenario: The silhouette is not clipped by its own viewport

- **WHEN** the orb's feathered limb is rendered
- **THEN** alpha reaches 0 inside the drawing area, since world space is normalised by `min(resolution.x, resolution.y)` and a falloff still carrying alpha at 0.5 would be cut flat against the sides while continuing into the corners — a square halo rather than a round one

#### Scenario: No multi-pass rendering

- **WHEN** the orb is rendered on any platform
- **THEN** it completes in a single pass, with any lighting produced within the shader

### Requirement: Silhouette firmness and rear lighting are per-instance

The Orb SHALL expose `edge` and `backlight`, both `0..1` and both defaulting to `0`, with equivalent meaning on all three platforms.

Neither can be passed to `composite()`, whose signature is frozen (`docs/shader-abi.md`). Both are therefore applied in the per-shape epilogue, which post-processes the compositor's output and has access to the same world-space `p` and the same constants. This is the `u_scale` precedent and is explicitly not part of the frozen four-channel ABI.

#### Scenario: Edge tightens the limb without hollowing the orb

- **WHEN** `edge` is raised
- **THEN** the silhouette's feather narrows while interior density is unchanged — the adjustment is made in the feather coordinate, because with a transparent core the interior and feather alpha ranges overlap and an alpha-space remap cannot distinguish them

#### Scenario: Backlight reads as light around the orb, not an outline on it

- **WHEN** `backlight` is raised
- **THEN** the limb brightens and the glow extends slightly past the silhouette, carrying its own alpha and tinted by the field's colour rather than driven to white

#### Scenario: Both default to off

- **WHEN** neither prop is supplied
- **THEN** the orb renders exactly as the compositor produced it, on every platform
