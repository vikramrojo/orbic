## Why

Products that ship an AI agent need an orb, and they need the rest of the product — stat cards, panels, banners — to look like it belongs to the same system. Today those are two unrelated jobs: existing orb libraries (ElevenLabs Orb, react-ai-orb, react-native-magic-orb, thinking-orbs, metal-fx) each cover a single platform, hard-code their look, and bury their personality inside the shader, so nothing ships the same orb to web, React Native and SwiftUI, and nothing gives visual continuity between the orb and the surfaces around it.

Orbic exists because those two problems have one solution: separate **the material** from **the shape** from **the personality**. Swap the material and every shape reskins together, so brand unity stops being a discipline someone maintains by hand and becomes structural.

## What Changes

- New monorepo shipping three bundles from one source of truth: `@orbic/web` (WebGL2), `@orbic/native` (Skia + Reanimated), and `Orbic` (SwiftUI, SPM).
- Two components with deliberately divergent prop surfaces: an animated `<Orb>` driven by a state machine, and a static `<Surface>` for card and panel backgrounds.
- A two-function shader contract — a swappable `field()` supplying the material, and shipped `composite()` compositors supplying the shape. Neither declares a uniform; all uniform plumbing lives in per-platform preambles, which is what lets one authored file target three shading languages by concatenation rather than by compiler.
- A **frozen four-channel uniform ABI** (`energy`, `coherence`, `warmth`, `pulse`) with no generic escape hatch. Custom shaders are reskins by design.
- Three built-in fields adapted from [pbakaus/radiant](https://github.com/pbakaus/radiant) (MIT): Chladni Resonance, Silk Cascade, and Shifting Veils. No bespoke brand field ships in v1.
- Personality expressed as **data** (`presets.json`) rather than shader code: five neutral presets (`subtle`, `active`, `cooling`, `warming`, `pacing`) plus per-transition spring overrides, hand-integrated identically in TypeScript and Swift.
- A build-time-only custom shader path via an `orbic build-shader` CLI. **No runtime shader compilation on any platform.**

### Constraints accepted as scope boundaries

- **No bloom or multi-pass post-processing.** Glow is faked as in-shader rim falloff. Multi-pass would fork the shader core across both shapes and all three platforms.
- **Swift floor is iOS 17 / macOS 14**, because SwiftUI `.colorEffect` is the renderer. Supporting older systems would mean a raw `CAMetalLayer` renderer.
- **`<Surface>` is always static.** No drift or animation option, which removes the animated-surface hygiene path and the cost question of many surfaces on one screen.
- **Phyllotaxis is deferred past v1.** The radiant original is a stateful Canvas 2D particle system with no fragment shader at all, and SwiftUI `.colorEffect` is a pure per-pixel function that cannot express particles. A procedural replacement is possible but is both the highest-risk and the highest-per-pixel-cost item in the project, and it loses the original's defining trailing quality in translation. Three fields already prove the field-swap premise.

## Capabilities

### New Capabilities
- `shader-field-contract`: The `field()` / `composite()` function contract, the frozen four-channel uniform ABI, the aspect-preserving world-space coordinate convention, the portable-subset rules, and the `oMod`/`oAtan2` shims.
- `shader-build-pipeline`: Build-time concatenation of preamble + field + compositor + epilogue into 18 artifacts (3 fields × 2 shapes × 3 targets), Metal type aliasing, generated-file freshness enforcement, and the lint that rejects non-portable fields.
- `shader-fields`: The three shipped built-in fields, their adaptation requirements (coordinate normalisation, `u_mouse` removal, uniform remapping, `warmth` grafting), and MIT attribution obligations.
- `motion-personality`: `presets.json` as single source of truth, the specified spring formulation (semi-implicit Euler, fixed 1/120 s substeps), and cross-platform numerical conformance.
- `orb-component`: Public API and behaviour of the animated orb — state transitions, sizing, speed, pause.
- `surface-component`: Public API and behaviour of the static surface — preset-driven channels and legibility requirements under real text.
- `platform-renderers`: The three renderers and the hygiene contract they share — reduced-motion static frames, offscreen and hidden-tab pausing, DPR capping, SSR fallback, and one shared WebGL2 context process-wide.

### Modified Capabilities

None. `openspec/specs/` is empty; this is the founding change.

## Impact

- **New repository content.** `/Users/vikramojo/Git/orbic` currently holds only `openspec/`. Everything here is greenfield: pnpm workspace, `Package.swift` at repo root (SPM requires it there), `packages/orb-{core,web,native}`, `Sources/Orbic`, `scripts/`, `examples/`, `tests/`.
- **New dependencies, deliberately minimised.** `@shopify/react-native-skia` is a required peer for the native bundle; `react-native-reanimated` is an **optional** peer needed only by `<Orb>`, so a Surface-only consumer installs 9.7 MB rather than 14.3 MB. Web has no runtime dependencies; Swift has none at all. Explicitly **not** Three.js/R3F — `three` alone is 22 MB unpacked to draw one quad whose fragment shader is hand-written.
- **Committed generated artifacts.** SPM consumers cannot run a Node build step, so generated `.metal` files and `Presets.swift` must exist in the tree, with CI regenerating and diffing to prevent drift.
- **Third-party licensing.** pbakaus/radiant is MIT and requires the copyright notice be retained: a `NOTICE` file, README credit, and per-field provenance headers.
- **A frozen public contract.** The uniform ABI becomes unchangeable without breaking every third-party shader, so it is gated behind an explicit up-front validation exercise against all three shipped fields, plus one field outside the shipped set, before it is declared frozen.
