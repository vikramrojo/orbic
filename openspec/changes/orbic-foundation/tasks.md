## 1. Repository scaffold

- [x] 1.1 Create pnpm workspace with `packages/orb-core`, `packages/orb-web`, `packages/orb-native`
- [x] 1.2 Add `Package.swift` at the repository root with an `Orbic` library target
- [x] 1.3 Add shared TypeScript config, ESLint, and Vitest setup
- [x] 1.4 Add `NOTICE` with pbakaus/radiant MIT attribution and credit the source in `README.md`
- [x] 1.5 Add CI workflow skeleton with jobs for lint, test, shader compilation, and generated-file freshness

## 2. Core personality layer

- [x] 2.1 Author `presets.json` with the five presets and the `springs` table including per-transition overrides
- [x] 2.2 Implement `spring.ts` as semi-implicit Euler with fixed 1/120 s substeps accumulated against real frame delta
- [x] 2.3 Implement `states.ts` resolving a transition to its spring parameters, falling back to `default`
- [x] 2.4 Write a fixture generator emitting `tests/fixtures/golden-frames.json` for every preset-to-preset transition
- [x] 2.5 Add Vitest assertions for frame-rate independence at 30, 60 and 120 fps
- [x] 2.6 Implement `build-presets.mjs` generating `Sources/Orbic/Presets.swift` from `presets.json`

## 3. ABI validation gate

- [x] 3.1 Map Chladni's `u_modeSpeed` and `u_complexity` onto the four channels and define its `warmth` response
- [x] 3.2 Map Silk Cascade's `u_flowSpeed` and `u_sheenIntensity` onto the four channels and define its `warmth` response
- [x] 3.3 Map Shifting Veils' `u_layerSpeed` and `u_layerCount` onto the four channels and define its `warmth` response
- [x] 3.4 Record the mappings in `design.md`; if any field cannot be expressed in four channels, revise the ABI before proceeding
- [x] 3.5 Sanity-check the contract against one field outside the shipped set — `gate-3.5/cellular-drift.orb`, from the Shadertoy/IQ cellular-noise tradition, built via the shipped CLI and compiled on real Metal and real Skia; `gate-3.5/probe.mjs` sweeps each channel and `gate-3.5/findings.md` records the numbers. Passes, but overturns "four channels are not too tight": `coherence` is a lossy projection, and the exercise caught the `pulse`-applied-twice bug
- [x] 3.6 Declare the ABI frozen and document it — `docs/shader-abi.md` now opens with **Status: FROZEN** plus the `coherence`-is-lossy caveat, and `design.md`'s gate section records the closure and the revised finding

## 4. Shader pipeline

- [x] 4.1 Write `preamble.glsl`, `preamble.sksl`, `preamble.metal`, each defining `oMod` and `oAtan2` natively
- [x] 4.2 Write `epilogue-orb.{glsl,sksl,metal}` mapping geometry to world space at orb scale
- [x] 4.3 Write `epilogue-surface.{glsl,sksl,metal}` mapping geometry to world space at surface scale
- [x] 4.4 Implement `lint-shader.mjs` rejecting textures, `discard`, `while`, unbounded loops, dynamic indexing, preprocessor directives, bare `mod`, two-arg `atan`, and `uniform` declarations
- [x] 4.5 Add lint fixtures of deliberately-invalid fields and assert each is rejected with a specific message
- [x] 4.6 Implement `build-shaders.mjs` performing concatenation plus the Metal type-alias table
- [x] 4.7 Add a placeholder flat-colour field driven by `energy` and verify all six artifacts build and compile
- [ ] 4.8 Add CI compilation checks: `xcrun metal`, `RuntimeEffect.Make`, and headless-gl
- [x] 4.9 Add the generated-file freshness check that fails on a non-empty `git diff`

## 5. Orb compositor and web renderer

- [x] 5.1 Write `compositors/orb.orb` with sphere SDF mask, rim falloff, and alpha outside the mask
- [x] 5.2 Implement the shared process-wide WebGL2 context with once-only shader compilation
- [x] 5.3 Implement `<Orb>` for web with `field`, `state`, `size`, `speed`, `paused`
- [x] 5.4 Wire the shared spring integrator to uniform updates via a rAF pump
- [x] 5.5 Implement DPR capping at 2
- [x] 5.6 Implement reduced-motion static-frame rendering
- [x] 5.7 Implement `IntersectionObserver` offscreen pause and hidden-tab pause
- [x] 5.8 Implement the SSR CSS-gradient fallback and verify hydration without layout shift
- [x] 5.9 Verify mid-flight state retargeting preserves velocity without discontinuity
- [x] 5.10 Implement WebGL context-loss recovery: `preventDefault()` on `webglcontextlost`, recompile and resume on `webglcontextrestored`, static fallback during loss
- [x] 5.11 Implement runtime shader-compile-failure fallback: diagnostic emitted once, solid colour from `warmth`/`energy`, never a crash or blank region
- [x] 5.12 Implement unknown-`state`/`field` fallback with a warning naming the valid options
- [x] 5.13 Defer the `t` wrap until the component is paused, offscreen, or hidden so the discontinuity is never observed

## 6. Field ports

- [x] 6.1 Port Chladni Resonance: normalise coordinates, strip `u_mouse`, apply `oMod`/`oAtan2`, remap uniforms, graft `warmth`, add provenance header
- [x] 6.2 Port Silk Cascade: convert per-axis aspect to `min()`-normalised world space, strip `u_mouse`, remap uniforms, graft `warmth`, add provenance header
- [x] 6.3 Port Shifting Veils: recentre from corner origin to world space, strip `u_mouse`, remap uniforms, graft `warmth`, add provenance header
- [x] 6.4 Write `compositors/surface.orb` (contrast damping, reduced octaves, grain attenuation) BEFORE field tuning — task 6.5 cannot be done without it
- [x] 6.4a WIRING — `build-shaders.mjs` (~line 150/158) and `check-shaders.mjs` (~line 61) both hardcode `placeholder-passthrough.orb` as the surface compositor and never reference `surface.orb`. Until this one-line-each fix lands, every `*-surface.*` artifact is built from the placeholder and any green from those scripts is vacuous
- [ ] 6.5 Tune each ported field against both compositors side by side
- [ ] 6.6 Add the aspect-distortion regression test comparing the central 180×180 region at 400×180, 180×400 and 300×300 within 1/255 mean absolute difference
- [x] 6.7 Add the brand-unity check asserting a field swap changes both shapes together

## 7. Surface legibility
- [x] 7.1 Implement `<Surface>` for web with `field`, `preset`, `scale` and per-channel overrides, with no animation option
- [x] 7.2 Verify no rAF loop is scheduled, and that eight mounted Surfaces schedule no per-frame work
- [x] 7.3 Implement the automated contrast check: brightest rendered luminance vs body-text colour, asserting ≥ 4.5:1 (WCAG AA)
- [x] 7.4 Run the check across all 3 fields × 5 presets and tune the compositor until every combination passes
- [ ] 7.5 Wire the contrast check into CI so a legibility regression fails the build
- [x] 7.6 Implement unknown-`preset`/`field` fallback with a warning naming the valid options
- [x] 7.7 Build a runnable web dev harness (Vite dev server + demo page) showing `<Orb>` in all five presets and `<Surface>` behind real body text, with a field switcher — REQUIRED for the review checkpoint below
- [x] 7.8 Make `<Surface>` non-interactive on every platform: `pointer-events: none` (web), `pointerEvents="none"` (RN Skia canvases absorb touches natively), `.allowsHitTesting(false)` (SwiftUI)

---

## ⏸ CHECKPOINT — STOP FOR USER REVIEW

**Do not begin group 8 until the user has reviewed the web build and said to continue.**

At this point the web bundle is feature-complete and viewable: `<Orb>` with all five presets and spring transitions, `<Surface>` static behind text, all three ported fields, both compositors, and the full hygiene layer. Run the harness from 7.7 and hand the user a URL.

What the user is reviewing: whether the orb reads as the right creature, whether the transitions have the intended character (`subtle→active` snapping awake, `active→subtle` sighing out), whether the three fields feel like a coherent set, and whether Surfaces stay legible under real text.

Native and Swift work (groups 8-9) deliberately waits. Tuning discovered here changes `presets.json` and the compositors, and both propagate to the other two platforms — porting first would mean porting twice.

---

## 8. React Native bundle

- [x] 8.1 Implement `<Orb>` using Skia `Shader`/`Fill` with `RuntimeEffect` — `packages/orb-native/src/Orb.tsx`; effects compiled once per field/shape and cached, `null` on driver rejection so it degrades to the flat colour
- [x] 8.2 Drive uniforms on the UI thread, using the shared integrator rather than `withSpring` — via `useFrameCallback` rather than `useDerivedValue` as the task worded it: the springs must be ADVANCED each frame, which is a frame callback's job; `useDerivedValue` derives from existing shared values and has no frame signal. A worklet cannot call methods on the `OrbRuntime` class, so state lives in shared values and calls `integrateSpring`, which `@orbic/core` now marks `'worklet'` (inert off-RN) so the integrator is shared rather than reimplemented
- [x] 8.3 Declare `react-native-reanimated` optional and implement the JS-thread rAF fallback — the manifest was already correct; the fallback is `useJsThreadUniforms`, selected once at module load (React forbids conditional hooks). Reanimated is resolved through a guarded `require`, never a static import, because Metro resolves imports at build time and a static one would make a Surface-only consumer unbundleable
- [x] 8.4 Verify `<Surface>` renders with Skia alone in a project without Reanimated — asserted structurally against the import graph, which is the layer that actually decides it: a render test with Reanimated mocked would pass even if a static import made the package unbundleable for that consumer. NOT yet confirmed on a device
- [x] 8.5 Document the JS-thread fallback as a degradation — `packages/orb-native/README.md`, naming mid-flight retarget as the case where it degrades worst
- [x] 8.6 Implement `<Surface>` as always-static — no animation import exists in the file at all, so it is structural rather than a default; clock pinned at 0, `pointerEvents="none"`. Tests assert all three
- [ ] 8.7 PARTIAL — reduced-motion (`AccessibilityInfo.isReduceMotionEnabled` + `reduceMotionChanged`) and backgrounded pausing (`AppState`) are implemented and feed one `active` flag. Still missing: OFFSCREEN pausing, since React Native has no `IntersectionObserver` equivalent and this needs a viewability approach, so an Orb scrolled out of view keeps animating where the web one pauses; and DPR capping, where Skia owns the backing surface scale and whether an explicit cap is needed has not been measured
- [x] 8.8 Assert the golden-frame fixture against the native integrator — `tests/goldenFrames.test.ts` drives `stepUniforms` (the exact function the UI-thread worklet runs) across all 20 transitions, checking positions AND velocities, plus the clamp/negative-delta/speed/wrap behaviours

## 9. Swift bundle

- [x] 9.1 Implement `Spring.swift` matching the shared formulation exactly
- [x] 9.2 RESOLVED — SPM cannot produce a usable `default.metallib` here. Determined empirically: `swift build` with `.process("Shaders")` copies the `.metal` files in as raw source without compiling; `xcodebuild` does run `CompileMetalFile` but linking all eight fails with ~40 duplicated symbols, because every artifact defines the same `[[stitchable]]` `orbicOrb`/`orbicSurface` entry point and the same `field`/`composite` helpers. Each artifact compiles cleanly to its OWN `.metallib`, so the model is: precompile per field, shape and platform (`scripts/build-metallibs.mjs`), commit the output, and load with `ShaderLibrary(url:)`. Committed rather than built on demand because a `.metallib` bakes in its target triple AND because the Metal toolchain is a separately downloaded component as of Xcode 26, so consumers must not need it. Proven by `ShaderLibraryTests`, which loads every library through Metal and asserts the exported entry point. Prerequisite bug fixed on the way: the Metal artifacts had never compiled at all (program-scope `const` is invalid MSL)
- [x] 9.3 Implement `Orb` using `ShaderLibrary` with `.colorEffect` and `TimelineView(.animation)` — `Sources/Orbic/Orb.swift`, driven by `OrbDriver` (the shared `OrbicSpring`, not `withSpring`, so the golden-frame contract holds). Retargets mid-flight, and `speed` scales the field clock only
- [x] 9.4 Implement `Surface` as static, using no `TimelineView` — `Sources/Orbic/Surface.swift` contains no `TimelineView` at all, so "always static" is structural rather than a default; clock pinned at 0, `allowsHitTesting(false)` per the spec's pass-through requirement
- [x] 9.5 Implement reduced-motion handling — uses SwiftUI's `@Environment(\.accessibilityReduceMotion)` rather than `UIAccessibility.isReduceMotionEnabled` directly: it is backed by that same setting on iOS but also works on macOS, which this package supports and where `UIAccessibility` does not exist. Reduced motion (like `paused`) skips constructing `TimelineView` entirely, so no per-frame work is scheduled
- [x] 9.6 Add XCTest asserting the golden-frame fixture at ±0.001
- [x] 9.7 Verify the package resolves and builds as an SPM dependency from a clean checkout
- [x] 9.8 CONFIRMED BROKEN — fix the case collision: `tests/` and `Tests/` share an inode locally, git records lowercase `tests/`, and on a case-sensitive checkout `swift build` fails with overlapping sources between `Orbic` and `OrbicTests`. Move the shared fixture to top-level `fixtures/` and keep `Tests/` for SPM convention
- [x] 9.9 Update every reference to the moved fixture: `generate-fixtures.ts`, the Vitest golden-frame suite, `package.json` scripts, Swift `TestSupport.swift`, and the CI freshness paths
- [x] 9.10 Add `scripts/check-path-case.mjs` and a SwiftPM layout assertion, wired into the `lint` job (not the Swift jobs — `macos-14` folds case and cannot catch this)

## 10. Distribution and documentation

- [ ] 10.1 Configure per-field entry points and assert an unused field is absent from a consumer bundle
- [ ] 10.2 Measure and record shipped bundle size per platform for a one-field consumer
- [ ] 10.3 Add `react` as a peer of `@orbic/web` (currently declares none) and audit every manifest for peers the library never imports
- [x] 10.4 Implement the `orbic build-shader` CLI producing six artifacts from a custom field — `packages/orb-core/bin/orbic.mjs`, registered as the `orbic` bin (and added to `files` so it survives packing)
- [x] 10.5 Verify the CLI writes no artifacts when the lint fails — structural rather than cleanup: the lint throws inside `buildArtifacts` before any write, and the CLI never pre-creates the output directory, so a rejected field leaves no directory at all (not merely an empty one). Covered by tests asserting `existsSync(outDir) === false`, exit code 1, and that the message names the violated rule and line
- [x] 10.6 Document the frozen uniform ABI, the portable subset, and the `oMod`/`oAtan2` shims
- [x] 10.7 Document the React Native dependency floor honestly, including that Skia is required and is large
- [ ] 10.8 Build the web, native and iOS example apps showing an Orb and Surface sharing a field
- [ ] 10.9 Step through all five presets in each example app and confirm transitions read identically
- [ ] 10.10 Manually verify reduced-motion and backgrounding behaviour on each platform

## 11. View-level parity harness

- [ ] 11.1 Build a pixel-diff harness that renders through the real component on each platform, not by calling the integrator directly
- [ ] 11.2 Calibrate the parity threshold empirically against an identical field before asserting it, rather than assuming a value
- [ ] 11.3 Diff a single frozen frame per platform against the web reference before trusting any freeze-time or reduced-motion path
- [ ] 11.4 Verify the diagnostic itself on a known-identical pair and a known-different pair, so a buggy comparator cannot masquerade as a finding
