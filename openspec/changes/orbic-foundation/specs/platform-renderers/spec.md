## ADDED Requirements

### Requirement: Three renderers from one source of truth

The system SHALL provide a WebGL2 renderer, a Skia renderer, and a SwiftUI Metal renderer, all consuming the same generated shaders and the same `presets.json`.

#### Scenario: Web renderer

- **WHEN** the web bundle renders
- **THEN** it uses raw WebGL2 on a single fullscreen quad, without Three.js or React Three Fiber

#### Scenario: Native renderer

- **WHEN** the native bundle renders
- **THEN** it uses a Skia `RuntimeEffect` shader, with uniforms driven on the UI thread via Reanimated shared values when Reanimated is present

#### Scenario: Swift renderer

- **WHEN** the Swift package renders
- **THEN** it uses `ShaderLibrary` with `.colorEffect`, targeting iOS 17 / macOS 14 or later

### Requirement: Shader compile failure degrades rather than crashes

A shader that compiles in CI may still be rejected at runtime by a specific GPU driver. Renderers SHALL NOT crash or render nothing when compilation fails.

#### Scenario: Compile failure falls back to a solid frame

- **WHEN** a shader fails to compile on the consumer's device
- **THEN** the renderer emits a diagnostic error naming the field and target, and renders a solid colour derived from the preset's `warmth` and `energy` channels, rather than crashing or leaving a blank region

#### Scenario: Failure is reported once, not per frame

- **WHEN** compilation has already failed for a given field
- **THEN** the diagnostic is emitted once and compilation is not retried every frame

### Requirement: WebGL context loss is recoverable

Browsers reclaim WebGL contexts under GPU memory pressure, routinely so on mobile. The web renderer SHALL survive this.

#### Scenario: Context is restored

- **WHEN** the shared WebGL2 context is lost and later restored
- **THEN** the renderer listens for `webglcontextrestored`, recompiles its shaders, and resumes rendering without a page reload

#### Scenario: Loss does not blank every instance permanently

- **WHEN** the context is lost while one Orb and eight Surfaces are mounted
- **THEN** all instances display their last frame or a static fallback during the loss, and all recover on restore, since they share one context and would otherwise all go black together

#### Scenario: Default context-lost handling is prevented

- **WHEN** the `webglcontextlost` event fires
- **THEN** the renderer calls `preventDefault()`, without which the browser will not fire `webglcontextrestored` at all

### Requirement: Reanimated is an optional peer dependency

`react-native-reanimated` SHALL be an optional peer required only by `<Orb>`. `<Surface>` SHALL function without it. When it is absent, `<Orb>` SHALL fall back to a JS-thread animation pump.

#### Scenario: Surface-only consumer omits Reanimated

- **WHEN** an app installs `@orbic/native` and uses only `<Surface>`
- **THEN** it renders correctly with Skia alone, without Reanimated installed

#### Scenario: Orb degrades rather than fails without Reanimated

- **WHEN** `<Orb>` renders in an app without Reanimated
- **THEN** it animates via a JS-thread pump, producing the same channel values from the shared integrator but with responsiveness degraded under JS-thread load

#### Scenario: Degradation is documented

- **WHEN** the JS-thread fallback is used
- **THEN** the documentation states it is a degradation rather than a supported equivalent of the UI-thread path

### Requirement: One shared WebGL2 context

The web renderer SHALL use a single WebGL2 context process-wide across all component instances, compiling each shader once.

#### Scenario: Many instances share one context

- **WHEN** a page mounts one Orb and eight Surfaces
- **THEN** exactly one WebGL2 context exists and each distinct shader is compiled once

### Requirement: Reduced motion renders a static frame

All renderers SHALL respect the platform reduced-motion setting by rendering a single static frame at the preset's resting values.

#### Scenario: Reduced motion on web

- **WHEN** `prefers-reduced-motion` is set
- **THEN** the orb renders one frame at resting values and no animation loop runs

#### Scenario: Reduced motion on Apple platforms

- **WHEN** `UIAccessibility.isReduceMotionEnabled` is true
- **THEN** the orb renders one static frame rather than animating

### Requirement: Animation pauses when not visible

Animated content SHALL stop advancing when offscreen or when the tab or application is hidden. This applies to `<Orb>` only, since `<Surface>` schedules no ongoing work.

#### Scenario: Offscreen pause

- **WHEN** an animated Orb scrolls out of the viewport
- **THEN** its animation loop stops and resumes when it returns

#### Scenario: Hidden tab pause

- **WHEN** the browser tab is hidden
- **THEN** no frames are scheduled until it becomes visible again

### Requirement: Device pixel ratio is capped

Renderers SHALL cap the effective device pixel ratio at 2.

#### Scenario: High-DPR device

- **WHEN** rendering on a device reporting a DPR of 3
- **THEN** the drawing buffer is sized using a DPR of 2

### Requirement: Web rendering is SSR-safe

The web bundle SHALL render on the server without a WebGL context and hydrate cleanly.

#### Scenario: Server render produces a fallback

- **WHEN** a component is server-rendered
- **THEN** a static CSS-gradient fallback is emitted, which is replaced on hydration without layout shift
