## ADDED Requirements

### Requirement: Presets are data, not code

Preset channel values and spring parameters SHALL live in a single `presets.json` consumed by all three platforms. Adding or retuning a preset SHALL NOT require editing shader or renderer source.

#### Scenario: One edit reaches three platforms

- **WHEN** a preset's `energy` value is changed in `presets.json`
- **THEN** web, native and Swift all reflect the new value after regeneration, with no per-platform source edit

#### Scenario: Swift consumes the same source of truth

- **WHEN** the preset generator runs
- **THEN** `Presets.swift` is produced from `presets.json` rather than hand-maintained

### Requirement: Five neutral presets

The library SHALL ship the presets `subtle`, `active`, `cooling`, `warming`, and `pacing`. Preset names SHALL be neutral qualities, not agent activity verbs.

#### Scenario: Preset names carry no agent semantics

- **WHEN** the public preset list is inspected
- **THEN** it contains no names such as "thinking", "listening", or "speaking", so the library presumes nothing about the consuming application

### Requirement: Character lives in per-transition springs

The system SHALL support spring parameters that vary by transition, not only by target state.

#### Scenario: Asymmetric transitions

- **WHEN** transitioning `subtle→active` and then `active→subtle`
- **THEN** the first uses a high-stiffness spring that snaps awake and the second a low-stiffness spring that settles slowly, despite connecting the same two presets

#### Scenario: Unlisted transition falls back

- **WHEN** a transition has no explicit override in `presets.json`
- **THEN** the default spring parameters are applied

### Requirement: A single specified spring integrator

All platforms SHALL implement the same spring formulation: semi-implicit Euler with fixed 1/120 s substeps accumulated against real frame delta. Reanimated's `withSpring` SHALL NOT be used to drive channel values.

#### Scenario: Frame-rate independence

- **WHEN** the same transition is integrated at 30, 60 and 120 fps
- **THEN** the channel values at any given elapsed time agree within tolerance

#### Scenario: Cross-platform numerical conformance

- **WHEN** the golden-frame fixture — all 20 ordered preset-to-preset transitions, each sampled at 8 fixed elapsed times, each sample covering all four channels — is asserted in Vitest and in XCTest
- **THEN** all 640 sampled values match the fixture within ±0.001

#### Scenario: Numeric conformance is not sufficient on its own

- **WHEN** the golden-frame suite passes on all three platforms
- **THEN** a separate view-level parity check SHALL also run, because the golden suite calls the integrator directly and never goes through a renderer — a defect in how a platform applies `speed`, wraps `t`, or feeds uniforms to the shader would pass all 640 numeric checks and still render a different image

#### Scenario: Integration constants are carried by the fixture, not reimplemented

- **WHEN** a platform implements the integrator
- **THEN** it reads `fixedSubstep`, `maxFrameDelta` and the spring `mass` from the fixture metadata, so no platform can silently choose a different substep, clamp, or default mass and drift from the others

#### Scenario: A large frame delta is clamped identically everywhere

- **WHEN** a single frame delta of 60 seconds is supplied, as after a backgrounded tab resumes
- **THEN** the integrator advances by exactly `maxFrameDelta` worth of simulation rather than running 7200 substeps, on every platform

#### Scenario: Reanimated is confined to transport

- **WHEN** the native renderer animates
- **THEN** Reanimated holds shared values and drives uniforms on the UI thread, but the channel values themselves come from the shared integrator

#### Scenario: Integrator runs without Reanimated

- **WHEN** the shared integrator is exercised in isolation
- **THEN** it produces conformant channel values with no dependency on any animation library, on any platform
