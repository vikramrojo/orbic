# Task 3.5 — ABI sanity-check against an out-of-lineage field

## Why this exercise exists

Tasks 3.1–3.4 mapped six candidate fields onto the four channels and concluded
the contract was generous. But all six came from **pbakaus/radiant** and
therefore share uniform conventions: they agreed with each other because they
have a common ancestor, not because the contract generalises. `design.md`
recorded the gate as explicitly *not closed* for that reason.

This exercise tests the contract against a field from a different lineage —
the Shadertoy / Inigo Quilez cellular-noise (Worley/Voronoi) tradition, whose
conventions were developed with no knowledge of radiant's uniform set.
`cellular-drift.orb` is authored here rather than copied so it can live in this
repository, but it is parameterised the way that tradition parameterises: cell
density, jitter, edge sharpness and drift.

## Method

1. Built through the shipped CLI — `orbic build-shader cellular-drift.orb` —
   so the exercise also dogfoods task 10.4 rather than calling internals.
2. Compiled on the real compilers: both `.metal` artifacts through
   `xcrun metal`, both `.sksl` through Skia's `RuntimeEffect.Make`.
3. Swept each channel independently at fixed `t` and measured the mean
   absolute RGB difference between the extremes, on both shapes
   (`probe.mjs`). Compiling proves nothing about expressiveness — a field can
   compile while ignoring three of its four channels.

## Results

Mean absolute difference across a full channel sweep, in 0–255 units:

| channel | orb | surface | verdict |
|---|---|---|---|
| `energy` | 20.383 | 21.686 | observable |
| `coherence` | 26.451 | 27.407 | observable |
| `warmth` | 13.494 | 13.865 | observable |
| `pulse` | 0.000 | 0.000 | nil at fixed `t` — expected, see below |
| `time` (control) | 15.902 | 19.493 | moves |

Lint passed unmodified, all six artifacts emitted, and both targets compiled
without error.

## The gate passes — but the contract is tighter than 3.1–3.4 concluded

**This field wants three structural axes; the ABI provides one.** In its own
tradition, cell *density*, feature-point *jitter*, and edge *sharpness* are
independent controls. `coherence` is the ABI's only structural channel, so all
three are driven from it along a hand-chosen curve:

```glsl
float density   = mix(3.0, 9.0,  coherence);
float jitter    = mix(1.0, 0.35, coherence);
float sharpness = mix(1.5, 7.0,  coherence);
```

That is an authoring decision, not a remapping. It fixes the correlation
between the three, so this field's "sparse but ragged" and "dense but crisp"
corners are **unreachable through the ABI**. Nothing is broken — the field
reads well across its coherence sweep, and the sweep is the strongest of the
four channels — but the earlier finding that "four channels are not too tight,
source fields only ever use two axes" is an artefact of the sample. Radiant
fields wanted one structural axis. A field from elsewhere wanted three.

**`warmth` is Orbic-imposed — confirmed from an unrelated direction.** This
tradition also hardcodes palettes as literal constants, so there was again no
source parameter to map. Porting any field will include original palette
authoring. That 3.1–3.4 finding now holds across two independent lineages,
which is a materially stronger claim than it was.

**`pulse` measuring 0.000 is correct, not a defect.** The sweep holds `t`
fixed and varies the uniform, and since the double-application fix (see below)
`pulse` acts entirely in the runtime — which folds it into `t` — rather than in
the field body. The `time` control row is where its effect is visible. The
probe asserts this direction explicitly, so a future field that *does* read
`pulse` for timing shows up as `UNEXPECTED` rather than passing quietly.

## What the gate caught

Running the exercise surfaced a real bug in the shipped fields: **`pulse` was
being applied twice.** The runtime accumulated `dt * speed * pulse` and every
field then multiplied by `pulse` again, making the effective clock rate
`pulse²` — `subtle` ran at 0.09× instead of 0.3×, `pacing` at 4.0× instead of
2.0×. Both platforms agreed with each other while disagreeing with the
documented ABI, which is exactly why nothing else caught it. Fixed in the
fields, documented in `docs/shader-abi.md`, and now prevented by a
`pulse-applied-twice` lint rule that also covers custom fields built through
the CLI.

This is the gate doing its job. It is also the argument for keeping the
exercise reproducible: `probe.mjs` can be re-run against any future candidate
field.

## Recommendation for 3.6

The ABI can be frozen. It survived an unrelated field on all three targets
with three of four channels observable on both shapes, and the one bug found
was in the fields, not the contract.

The freeze should record honestly that `coherence` is a **lossy** projection of
whatever structural axes a field actually has, rather than repeating that four
channels are roomy. A field author with more than one structural idea must
choose a curve through them, and the corners off that curve are unreachable.
