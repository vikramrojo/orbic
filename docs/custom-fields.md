# Building and testing a custom field

A **field** is the material an Orb or a Surface is made of. Orbic ships four
(`chladni`, `motes`, `silk`, `veils`, plus the `flat-color` placeholder), but
the pipeline takes any number, and nothing in the harness or the components is
hardcoded to the shipped set.

This document is the whole workflow: write a field, build it, prove it works,
and see it. For the contract a field must satisfy, read
[`shader-abi.md`](./shader-abi.md) first — it is **frozen**, so the rules there
are not suggestions.

---

## The short version

```bash
# One-off build of a field that lives anywhere on disk
pnpm orbic build-shader ./my-field.orb --out-dir ./out

# Or: drop it in the repo and it becomes a first-class field everywhere
cp my-field.orb packages/orb-core/shaders/fields/
pnpm build:shaders          # regenerates every artifact + the generated indexes
node scripts/build-metallibs.mjs   # macOS + Metal toolchain only
pnpm check-shaders          # lints, and compiles every SkSL through real Skia
node tools/render-check/self-test.mjs      # trust the harness first
node tools/render-check/contrast-check.mjs # then the legibility gate
pnpm dev:web                # look at it
```

---

## 1. Write the field

A field is one function:

```glsl
vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse)
```

Copy an existing one as a starting point. `packages/orb-core/shaders/fields/motes.orb`
is the most heavily commented and shows the cell-lattice pattern; `chladni.orb`
is the cheapest and simplest.

Four things catch people out, all of them enforced:

**`t` already includes `pulse`.** The runtime accumulates the field clock as
the integral of `pulse * dt`. Writing `float clock = t * pulse;` applies it
twice — the effective rate becomes `pulse²`. Use `t` directly. The
`pulse-applied-twice` lint rule rejects the mistake; it shipped in all three
original fields before that rule existed.

**Only `for` loops with a compile-time constant bound.** No `while`, no
dynamic array indexing, no textures, no `discard`, no preprocessor, no bare
`mod(` or two-argument `atan(` (use the `oMod`/`oAtan2` shims). If you need a
data-driven count, use a constant bound with an early `break`, as
`veils.orb` does.

**Cover the plane, don't compose a picture.** World space is normalised by
`min(resolution.x, resolution.y)`, and a Surface reveals more world space along
its long axis. A field built around a centred focal point gets stranded in
emptiness on a wide Surface. The cell-lattice structure in `motes.orb` is the
in-repo answer: divide the plane into cells, give each one a feature, and look
only at the 3×3 neighbourhood.

**`coherence` is your only structural channel, and it is lossy.** If your field
has several structural ideas — density, size, softness, travel — they must all
ride one hand-chosen curve, and the combinations off that curve become
unreachable. This is a property of the frozen ABI, documented in
[`gate-3.5/findings.md`](../openspec/changes/orbic-foundation/gate-3.5/findings.md).
Decide the curve deliberately rather than discovering it.

---

## 2. Build it

### Option A — one-off, outside the repo

```bash
pnpm orbic build-shader ./my-field.orb --out-dir ./out
```

Emits six artifacts: `{orb,surface}` × `{glsl,sksl,metal}`.

The lint runs first and **throws before anything is written**, so a rejected
field leaves no output directory at all — not an empty one. A lint failure
names the rule and the line, exits `1`, and prints "No artifacts were written."
A usage error exits `2`, so a script can tell "your shader is invalid" from
"you called me wrong".

Useful flags: `--name <name>` overrides the artifact basename,
`--metal-out-dir <dir>` additionally writes just the `.metal` files.

### Option B — ship it in the repo

Drop the `.orb` in `packages/orb-core/shaders/fields/` and run:

```bash
pnpm build:shaders
```

That regenerates, for every field:

| Output | Consumer |
| --- | --- |
| `packages/orb-core/shaders/generated/*.{glsl,sksl,metal}` | reference artifacts |
| `packages/orb-web/src/generated/shaders.ts` | web (GLSL) |
| `packages/orb-native/src/generated/shaders.ts` | React Native (SkSL) |
| `packages/orb-core/src/generated/fields.ts` | the canonical `FIELD_NAMES` |
| `Sources/Orbic/Generated/Fields.swift` | Swift's `OrbicFields.all` |
| `Sources/Orbic/Shaders/*.metal` | Swift, via metallibs |

**Naming matters more than it looks.** The field list is sorted, and
`FIELD_NAMES[0]` is the fallback for an unrecognised field name on every
platform. A field named `aurora` would sort before `chladni` and silently
become that fallback.

Then, on a Mac with the Metal toolchain:

```bash
node scripts/build-metallibs.mjs
```

Swift loads **prebuilt** `.metallib` resources, one per field, shape and
platform, and they are committed. That is not laziness: a `.metallib` bakes in
its target triple, and as of Xcode 26 the Metal compiler is a separately
downloaded component (`xcodebuild -downloadComponent MetalToolchain`) that a
stock install does not have — so compiling shaders during a *consumer's* build
would fail for anyone who hasn't fetched it. CI regenerates these and fails on
drift.

---

## 3. Test it

Run these in order. The first one is not optional.

```bash
node tools/render-check/self-test.mjs
```

This validates the **comparator itself** against a known-identical and a
known-different pair. Every check below trusts it, so a broken comparator could
otherwise report a confident false PASS.

```bash
pnpm check-shaders
```

Lints every artifact and compiles every SkSL through real Skia
(`RuntimeEffect.Make`). GLSL is **not** validated locally — headless-gl does
not build here, and the script says so rather than pretending. Metal is
verified in CI on a macOS runner, or locally with
`xcrun metal -o /tmp/x.metallib Sources/Orbic/Shaders/<field>-orb.metal`.

```bash
node tools/render-check/contrast-check.mjs
```

The legibility gate, and the one most likely to reject a new field. It renders
every field × preset through the surface compositor and requires **WCAG AA
4.5:1** between the *brightest* pixel and white body text. Your field is picked
up automatically — it enumerates the fields directory — so it simply gains five
rows.

If you fail it, the cause is usually brightness. `surface.orb`'s
`SURFACE_GAIN`/`SURFACE_KNEE` were solved against two measured points (Veils
peaking ~0.20, Chladni/Silk ~0.90) so both extremes land in a visible-but-safe
band. Additive fields — anything that sums contributions, like `motes` — trend
toward the bright end. Scale your output down rather than re-tuning the
compositor, which would move every other field.

```bash
node tools/render-check/aspect-check.mjs
node tools/render-check/brand-unity-check.mjs
```

Aspect checks that the same world region renders identically at 400×180,
180×400 and a native square — this is what catches a field that assumed a
square viewport. Brand-unity checks that swapping the field changes the orb
*and* the surface together.

### Is each channel actually doing something?

Compiling proves nothing about expressiveness — a field can compile while
ignoring three of its four channels. Sweep them:

```bash
pnpm orbic build-shader ./my-field.orb --out-dir /tmp/probe
node openspec/changes/orbic-foundation/gate-3.5/probe.mjs /tmp/probe
```

It reports the mean absolute difference each channel produces across a full
sweep, on both shapes. `energy`, `coherence` and `warmth` should all read
`observable`. `pulse` should read `0.000` — it acts through the runtime clock,
not as a uniform the field reads, and a non-zero value there means the field is
reading `pulse` for timing when it should be using `t`.

(The probe currently expects artifacts named `cellular-drift-*`; alias or copy
your `.sksl` files to that name until it takes a field argument.)

---

## 4. Look at it

```bash
pnpm dev:web
```

The example harness at `examples/web` enumerates `FIELD_NAMES`, so **a new
field appears in the switcher, gallery and playground with no edit to the app**.
The only name it filters is `flat-color`, the placeholder.

Judge it on the panels that exist for that purpose:

- **Orb + Surface unity card** — do both read as the same material? That is the
  claim the whole architecture makes.
- **Legibility panel** — real prose at 0.9rem over the surface. Small text is
  the point; if it is hard to read, the field is too busy or too bright.
- **Aspect pair** at exactly 400×180 and 180×400 — same feature size in both,
  or the field is assuming a square.
- **Playground** — sweep `state` to feel the transitions, and `edge` and
  `backlight` to see the field under different orb treatments.

To serve it on your network (e.g. to check a phone):

```bash
pnpm --filter @orbic/example-web exec vite --host 0.0.0.0
```

---

## 5. Consuming a field without forking Orbic

`orbic build-shader` writes plain text artifacts. The web renderer takes GLSL
source strings and the native one takes SkSL, both keyed by field name, so a
consumer can register a field built outside this repo by supplying the
generated source. Swift is the exception: it loads prebuilt `.metallib`
resources from the package bundle, so a custom field there currently means
building the metallib and adding it as a resource in your own target.
