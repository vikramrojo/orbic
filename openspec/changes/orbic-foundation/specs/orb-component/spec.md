## ADDED Requirements

### Requirement: Orb public API

The Orb SHALL expose `field`, `state`, `size`, `speed`, and `paused` with equivalent meaning on all three platforms.

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

### Requirement: Orb renders as a masked shape over arbitrary backgrounds

The orb compositor SHALL apply a sphere mask with rim falloff and SHALL produce transparency outside the mask. Glow SHALL be produced by in-shader rim falloff, not a bloom pass.

#### Scenario: Composites over a background

- **WHEN** an Orb is placed over a coloured background
- **THEN** the background shows through outside the orb's silhouette

#### Scenario: No multi-pass rendering

- **WHEN** the orb is rendered on any platform
- **THEN** it completes in a single pass, with glow produced by rim falloff within the shader
