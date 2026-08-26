# @orbic/native

Skia renderer for Orbic on React Native — an animated `<Orb>` and a static
`<Surface>`, sharing the same fields, presets and spring integrator as the web
and Swift bundles.

## Dependencies, stated honestly

| Package | Required? | Needed by |
|---|---|---|
| `@shopify/react-native-skia` | **Yes** | both components |
| `react-native-reanimated` | **Optional** | `<Orb>` only |
| `react` | Yes (peer) | both |

Skia is large. A Surface-only consumer installs roughly 9.7 MB; adding
Reanimated for `<Orb>` takes it to roughly 14.3 MB. That is the cost of this
bundle and it is not hidden — see `proposal.md` in the change that introduced
it.

`<Surface>` imports no Reanimated API and nothing from the animation runtime,
so it renders in a project where Reanimated is not installed at all. That is
structural rather than a promise: `src/Surface.tsx` has no path to
`react-native-reanimated`, and a test asserts it.

## The JS-thread fallback is a degradation, not an equivalent

When Reanimated **is** installed, `<Orb>` advances its springs inside
`useFrameCallback`, on the UI thread. Uniform updates keep flowing while the
JS thread is busy.

When Reanimated is **absent**, `<Orb>` still animates, via a
`requestAnimationFrame` pump on the JS thread. This is a fallback so that a
missing optional peer degrades instead of failing — it is **not** a supported
equivalent of the UI-thread path:

- The pump shares the JS thread with application work, so spring updates are
  delayed exactly when that thread is busy.
- The delay is worst during a mid-flight retarget — a state change while a
  previous transition is still settling — which is precisely the moment the
  motion is meant to feel responsive.
- Every frame also crosses into React state, so a busy tree costs more here
  than on the UI-thread path.

If motion quality matters in your app, install Reanimated. If you only use
`<Surface>`, do not.

Which path is used is decided once, when the module loads, by whether
`react-native-reanimated` resolves. It is never re-evaluated per render:
React forbids conditionally calling hooks, and whether a package is installed
cannot change while the process is running. `hasReanimated` is exported if you
want to assert it in your own tests.

## Why not `withSpring`

Reanimated's `withSpring` is deliberately unused. Its formulation and rest
threshold differ from this project's integrator and from the Swift one, so the
three platforms would visibly disagree on exactly the transitions that are the
product. Both paths here drive `@orbic/core`'s integrator instead — the one
the golden-frame fixture pins — and `packages/orb-native/tests/goldenFrames.test.ts`
asserts the native path against that fixture, positions and velocities alike.

The UI-thread path cannot use the `OrbRuntime` class, because a Reanimated
worklet cannot invoke methods on a JS-thread object. It holds state in shared
values and calls `integrateSpring` directly, which `@orbic/core` marks
`'worklet'` for this purpose. Only the orchestration around the integrator —
per-channel iteration, the delta clamp, the clock accumulation — is
re-expressed here, and that is what the golden-frame test guards.

## Not yet verified on a device

This package typechecks, and every piece of logic that can be tested without a
running app is tested. But no part of it has been rendered on a simulator or a
device, so the following are unproven rather than done:

- That Skia actually rasterises these shaders correctly on iOS and Android.
- Offscreen pausing. React Native has no `IntersectionObserver` equivalent, so
  an Orb scrolled out of view currently keeps animating. The web bundle pauses
  in that case; this one does not yet.
- DPR capping. The web bundle caps the device pixel ratio explicitly; here
  Skia owns the backing surface scale, and whether that needs an explicit cap
  has not been measured.
