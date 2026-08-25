# Orbic

Orbic ships one visual system — an animated `<Orb>` and a static `<Surface>` —
to three runtimes from a single source of truth: `@orbic/web` (WebGL2),
`@orbic/native` (Skia + Reanimated), and `Orbic` (SwiftUI, SPM).

The material (`field()`), the shape (`composite()`), and the personality
(`presets.json`) are separated by design, so swapping the material reskins
every shape on every platform.

## Packages

| Package | Platform | Renderer |
|---|---|---|
| `@orbic/web` | Web | Raw WebGL2 |
| `@orbic/native` | React Native | Skia `RuntimeEffect` |
| `Orbic` | Swift (iOS 17 / macOS 14+) | `ShaderLibrary` + `.colorEffect` |

## Documentation

- [`docs/shader-abi.md`](./docs/shader-abi.md) — the two-function shader
  contract, the world-space coordinate convention, the four-channel uniform
  ABI, and the portable shader subset. Start here before authoring a custom
  field.

## Bundle size and dependencies

These are measured figures, not targets — read this section before assuming
any of the three bundles is a light dependency.

**Web (`@orbic/web`)** has **zero runtime dependencies**. It's raw WebGL2 on
a single fullscreen quad — deliberately not Three.js or React Three Fiber,
since `three` alone is 22 MB unpacked to draw one quad whose fragment shader
is hand-written. A consumer importing one field pays roughly 6–8 KB gzipped
total. Fields ship as separate entry points, so importing
`@orbic/web/fields/silk` does not pull in the other two. Measured per-field
shader payload, gzipped:

| Field | Size (gzipped) |
|---|---|
| Chladni Resonance | 1.3 KB |
| Silk Cascade | 2.7 KB |
| Shifting Veils | 2.3 KB |

**Swift (`Orbic`)** has **no third-party dependencies at all**.

**React Native (`@orbic/native`)** is the one bundle where the dependency
floor is worth thinking about before adopting:

- [`@shopify/react-native-skia`](https://github.com/Shopify/react-native-skia)
  is a **required** peer — 9.7 MB unpacked, against roughly 5 KB of Orbic
  itself. There is no lighter path to running real shaders on RN today:
  `expo-gl` is coupled to Expo, and `react-native-wgpu` is immature.
- `react-native-reanimated` is an **optional** peer, needed only by
  `<Orb>` (it keeps per-frame uniform writes on the UI thread). `<Surface>`
  is static and needs none of it. A Surface-only consumer installs 9.7 MB of
  Skia rather than 14.3 MB of Skia + Reanimated.
- Without Reanimated, `<Orb>` falls back to a JS-thread `requestAnimationFrame`
  pump. This is a **documented degradation, not a supported equivalent**: it
  hurts responsiveness specifically under JS-thread load, which is exactly
  the condition under which a mid-flight state retarget needs to feel
  responsive.

Plainly: if an app does not already depend on Skia, `@orbic/native` is not a
lightweight addition to that app.

## Attribution

Three of Orbic's built-in shader fields — **Chladni Resonance**, **Silk
Cascade**, and **Shifting Veils** — are adapted from
[pbakaus/radiant](https://github.com/pbakaus/radiant), used under the MIT
License. See [`NOTICE`](./NOTICE) for the full copyright and permission
notice.

## Status

Orbic is under active development. See `openspec/changes/orbic-foundation/`
for the current design and task breakdown.
