# The Orbic shader ABI

This is the reference for anyone authoring a custom field, and the reference
Orbic's own built-in fields are ported against. It documents a contract that
becomes frozen once third-party shaders exist against it: the two-function
split, the coordinate convention, the four-channel uniform ABI, and the
portable subset a field body is allowed to use.

## The two-function contract

Every field is exactly two pure functions:

```glsl
vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse);
vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse);
```

`field()` supplies the material — the noise, the palette, the motion — and
returns `vec3`: an opaque colour with no alpha channel of its own. `composite()`
supplies the shape — the sphere mask and rim falloff for the orb, or the
contrast-damped, grain-attenuated frame for the surface — and returns `vec4`:
premultiplied colour and alpha (`vec4(rgb * a, a)`). Masking and transparency
are the compositor's responsibility alone; a field has no way to make itself
transparent. That split is exactly what makes a field shape-agnostic — it
colours every point it's asked about, and whichever compositor called it
decides what's actually visible.

**Neither function declares a `uniform`.** All uniform plumbing — reading
`u_time`, `u_energy`, and so on, and passing them in as arguments — lives
entirely in per-platform preambles and epilogues, never in the shared core.

This is not a style preference; it dissolves an otherwise irreconcilable
split. GLSL ES and SkSL read uniforms as **globals**. Metal `[[stitchable]]`
functions receive them as **function arguments** — there is no global
uniform storage a stitchable function can reach into. A shared core that
referenced a uniform global would simply not compile on the Metal target,
and no source-level rewrite fixes that, because the two forms aren't
syntactically related. Making the core a pure function taking every channel
as a parameter sidesteps the split instead of bridging it: arguments compile
identically whether the caller reads them from a global (GLSL, SkSL) or from
its own parameter list populated by the preamble (Metal).

## World space

Both functions receive `p`, a fragment position in **aspect-preserving world
space**, not normalized UV:

```
p = (fragCoord - 0.5 * resolution) / min(resolution.x, resolution.y) * scale
```

The divisor is `min(resolution.x, resolution.y)` — **never per-axis**. This
is load-bearing, not cosmetic. Normalizing per-axis (`p.x / resolution.x,
p.y / resolution.y`, or equivalently multiplying by `vec2(aspect, 1.0)`)
stretches circular features into ovals on any non-square target, and a
`<Surface>` is non-square almost by definition (a card, a banner, a panel).

Dividing by `min()` of both axes keeps a circular noise feature circular at
any aspect ratio, but it does this by making the *longer* axis span a
*larger* world-space range — it reveals more of the field, it does not clip
anything. Concretely, with `scale = 1`:

| Resolution | `p.x` span | `p.y` span |
|---|---|---|
| 300×300 | ±0.50 | ±0.50 |
| 400×180 | ±1.11 | ±0.50 |
| 180×400 | ±0.50 | ±1.11 |

A wide surface shows *more* of the field horizontally than a square one
does, because the short axis is what sets the shared scale for both. This is
a real constraint on field authoring, not just a coordinate detail: since
the long axis of a wide `<Surface>` reveals more world-space than the orb
ever shows, **a field has to look good across a wide window and can't rely
on centred composition**. A field with a strong focal point pinned at the
origin will show that focal point stranded in the middle of a wide card,
with unplanned material readable on either side. Fields need to read as an
extended material, not as a centred piece of artwork — something that's
easy to miss until a field authored and tuned only against the orb's small,
centred disc gets rendered at surface scale for the first time.

Each shape's epilogue chooses its own `scale`: the orb uses a small scale (`p`
spans roughly a unit disc), the surface uses a larger scale (zoomed further
out, so the same noise frequency reads as fine grain rather than a few large
blobs).

## The four channels

Four channels plus `t` are the entire uniform surface a field can observe.
There is no generic escape hatch — a fifth "misc" channel was considered and
deliberately not added.

| Channel | Range | Meaning |
|---|---|---|
| `energy` | `0..1` | Amplitude / intensity axis — how strongly the field's motion or contrast reads. Observable on both shapes. |
| `coherence` | `0..1` | Structure / density axis — low coherence reads as turbulent and diffuse, high coherence reads as ordered and crisp. Observable on both shapes. |
| `warmth` | `0..1` | Palette axis, cool → warm. Observable on both shapes. |
| `pulse` | `0..2` (every shipped preset stays within this range; the core does not clamp it) | Speed multiplier on the field's internal clock. Orb-only — see "Channel applicability" below. |
| `t` | seconds, wraps at 3600 s | Time, see below. |

These ranges and meanings aren't a guess — they come from mapping all six
candidate radiant fields' bespoke uniforms onto the four channels as the
gate exercise for freezing this ABI (`openspec/changes/orbic-foundation/`,
task 3.x). The findings differ sharply channel to channel, and are worth
stating plainly rather than smoothing over:

- **`pulse` — native in 6 of 6 fields.** Every field analysed used its speed
  uniform identically, as `t = u_time * u_speed`. Sources: `u_modeSpeed`,
  `u_flowSpeed`, `u_layerSpeed`, `u_auroraSpeed`, `u_driftSpeed`. This is the
  one channel every source field already expressed natively and
  consistently.

- **`coherence` — native in 4 of 6 fields, and inverted from the source
  uniforms.** A high source value (`u_complexity`, `u_layerCount`,
  `u_foldDepth`, `u_starDensity`) means *more* structure or density in the
  source, which reads as *less* coherent / more turbulent under Orbic's
  convention. For example Chladni's `u_complexity` multiplies mode numbers to
  produce higher-order nodal patterns — visually busier, i.e. lower
  `coherence`. Porting these fields means inverting the mapping, not just
  renaming the uniform.

- **`energy` — native in 2 of 6 fields.** Silk Cascade's `u_sheenIntensity`
  is the clearest case: it's passed as specular strength into three
  `shadeLayer` calls at weights 0.7 / 0.9 / 1.0, which is exactly an
  amplitude control. `u_auroraIntensity` is the other native case. The
  remaining four fields have no uniform that maps onto `energy` without
  reinterpretation.

- **`warmth` — native in 0 of 6 fields.** No radiant field has any warmth
  concept at all. Every one hardcodes its palette as literal `vec3`
  constants — Silk Cascade alone has three layers × four colour stops, all
  fixed. `warmth` is a purely Orbic-imposed axis with no equivalent to port;
  **every field port includes original palette authoring, not remapping.**
  Anyone estimating a field port as mechanical uniform-renaming will be
  wrong specifically here — this is the part of the work that's actual
  creative authoring, not translation.

### Channel applicability

`pulse` only has an observable effect across multiple frames — it's a
multiplier on how fast the field's internal clock advances, and a rate is
only visible as a *difference* between frames. `<Surface>` renders exactly
one frame and schedules no ongoing work ("Surface is always static", in
`surface-component`'s spec), so there is no second frame for a different
`pulse` value to diverge against. Whatever instant that single frame is
evaluated at, `pulse` produces no visible difference, so:

| Channel | Orb | Surface |
|---|---|---|
| `energy` | ✓ | ✓ |
| `coherence` | ✓ | ✓ |
| `warmth` | ✓ | ✓ |
| `pulse` | ✓ | no effect (one frame only, no rate to observe) |

Don't describe a `<Surface>` preset as "setting all four channels" — three of
them do something observable; `pulse` is inert there by construction, not by
omission.

### `t` wraps at 3600 seconds

`t` wraps at 3600 s to keep phase precision from decaying under mobile
`half` / `mediump` floating point over long-running animations. Fields must
not assume `t` grows unboundedly.

## The portable subset

A field body must restrict itself to constructs all three targets can
express identically. Banned:

- Texture sampling (no target guarantees a bound texture for a field).
- `discard`.
- Unbounded loops, and `while` loops of any kind.
- Dynamic (non-compile-time-constant) array indexing.
- Preprocessor directives — the three targets' preprocessors differ in
  capability and semantics, so permitting them would introduce
  platform-specific branches into a source that must be identical
  everywhere. Preambles are per-platform by construction and may use
  whatever their target supports; the shared core may not.
- Bare `mod(` — see shims, below.
- Two-argument `atan(` — see shims, below.
- Any `uniform` declaration — see the two-function contract, above.

Allowed: `for` loops with a compile-time constant bound.

## The shims: `oMod` and `oAtan2`

Fields needing modulo or two-argument arctangent call `oMod(x, y)` and
`oAtan2(y, x)` instead of the native forms. Each preamble defines these
natively for its target language.

This exists instead of a `mod` → `fmod` text rewrite because that rewrite
would be **wrong on negative operands, silently**. GLSL's `mod` and Metal's
`fmod` disagree there: `mod(-1.5, 6.0)` is `4.5` in GLSL, while `fmod(-1.5,
6.0)` is `-1.5`. Every field in this project is centred on the origin
(world space `p` spans positive and negative values symmetrically), so any
field using `mod()` spends roughly half its domain on negative operands —
exactly where a text-level `fmod` swap diverges from the original GLSL
behavior. A regex rewrite would compile fine and fail only visually, in a
way that's easy to miss in review. The shim makes the same call produce the
same result in all three languages, so there's nothing to get quietly wrong.
