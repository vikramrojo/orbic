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
  ABI, and the portable shader subset. **Frozen**; start here before
  authoring a custom field.
- [`docs/custom-fields.md`](./docs/custom-fields.md) — the end-to-end
  workflow for a custom field: write it, build it with `pnpm orbic
  build-shader`, prove it with the lint/compile/contrast checks, and see it in
  the example harness. The harness enumerates whatever fields the build
  produced, so a new one needs no edit to the app.

## Bundle size and dependencies

These are measured figures, not targets — read this section before assuming
any of the three bundles is a light dependency.

**Web (`@orbic/web`)** has **zero runtime dependencies**. It's raw WebGL2 on
a single fullscreen quad — deliberately not Three.js or React Three Fiber,
since `three` alone is 22 MB unpacked to draw one quad whose fragment shader
is hand-written.

Fields ship as separate entry points, so a consumer pays only for what they
import. Measured by bundling with esbuild (minified ESM, React external) and
asserted by `packages/orb-web/tests/bundleSize.test.ts`, which fails if
tree-shaking regresses:

| Consumer | Bundle |
|---|---|
| One field, via `@orbic/web/minimal` | **53.1 kB** |
| All five fields, via `@orbic/web` | **190.6 kB** |

Getting the smaller number is opt-in, and deliberately so. Importing
`@orbic/web` registers every field, because `<Orb field="anything" />` working
out of the box is the better default. To pay for one field, import from
`@orbic/web/minimal` and register it yourself:

```ts
import { Orb, registerField } from '@orbic/web/minimal';
import veils from '@orbic/web/fields/veils';

registerField('veils', veils);
```

Per-field shader payload, measured on the generated modules:

| Field | Raw | Gzipped |
|---|---|---|
| chladni | 35.2 kB | 10.3 kB |
| motes | 33.3 kB | 10.1 kB |
| silk | 48.5 kB | 12.3 kB |
| veils | 43.4 kB | 11.9 kB |
| flat-color (placeholder) | 23.0 kB | 8.0 kB |

Two things about those figures are worth stating rather than glossing. Each
field module carries **both** shapes, and each artifact is the whole
concatenated program — preamble, field, compositor, epilogue — so the shared
preamble and compositors are duplicated across every field rather than shared
between them. N fields therefore costs roughly N × (field + shared), not
shared + N × field. That is the price of the artifacts being standalone
programs, which is what makes them portable across three targets and lets a
custom field be built by CLI without linking against anything.

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
