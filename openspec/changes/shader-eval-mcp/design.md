## Context

Orbic's checks answer "is this shader legal?" — ten lint rules, a real-Skia compile, and four render gates. They do not answer "does it look like what was intended?", and every defect that reached a human passed all of them.

| | Conformance | Appearance |
|---|---|---|
| Question | Is it legal? | Is it right? |
| Today | lint, `check-shaders`, contrast, aspect, brand-unity | nothing |
| Failures caught | portable-subset violations, compile errors, WCAG regressions | none — all were caught by eye |
| Failures missed | — | blur, flat fallback disc, 8-vs-100 dots, fields 3-30x too dark |

largen, the system this borrows its shape from, draws the same line explicitly in its `eval` command: *"Scoring conformance and scoring appearance are different questions, and collapsing them into one number is the mistake this command exists to avoid."* It resolves appearance with a rendered browser plus an agent looking at a screenshot.

Orbic is better placed than that. `renderSksl` rasterises a field through real Skia in-process and returns unpremultiplied RGBA, so appearance can be both measured numerically and shown as an image, offline, with no browser.

## Goals / Non-Goals

**Goals:**

- Make the six ad-hoc probes permanent, tested and callable.
- Let an agent see a render, not only read numbers about it.
- Publish the portable subset as data derived from the code that enforces it.
- One implementation behind MCP, the CLI and CI.

**Non-Goals:**

- Authoring assistance. Writing GLSL was never the bottleneck.
- Splitting the shaders into their own package. Independent question, deferred.
- Redefining the ABI. `docs/shader-abi.md` is frozen; this describes it.
- Judging aesthetics. The tools report measurements and pixels; a human or a vision-capable agent judges.

## Decisions

### 1. Evaluation, not authoring

The linter already gives instant, precise feedback on legality, and the subset is small enough to hold in mind. Nothing in the recent defect history was a failure to write valid GLSL. Every one was a failure to perceive the result. Tools that generate shader source would address a problem that does not exist while leaving the one that does.

### 2. Tools return numbers and pixels

Numbers alone reproduce the existing blind spot: each of the six probes was written *after* a human said something looked wrong, because nobody knew which quantity to measure until the defect was visible. An image lets the caller notice the unanticipated. The cost is that images only help a vision-capable consumer, which the tool descriptions state rather than imply.

### 3. Rules from code; conventions authored; prose stays the source

Three candidate sources of truth for the machine-readable ABI:

| Source | Robustness | Cost |
|---|---|---|
| Parse `docs/shader-abi.md` | Brittle — a reworded heading breaks extraction | Doc stays sole source |
| Author JSON, generate prose (largen's way) | Clean pipeline | Frozen doc's reasoning cannot be generated |
| **Rules from lint code, conventions authored, test asserts agreement** | **Code is truth for rules; drift caught by test** | **One refactor + one test** |

The third. The linter's ten rules are already executable truth; the channel table and world-space conventions are stable enough to author. A test asserting the doc mentions every rule id catches divergence without making either artifact generated. Notably `pulse-applied-twice` has no bullet in the doc's banned list — it lives in prose — so the test encodes a mapping rather than assuming positional correspondence.

### 4. Three of four gates are already callable

`checkContrast(field, preset)`, `checkAspectDistortion(sksl, opts)` and `checkBrandUnity(a, b)` are exported and side-effect free; `process.exitCode` is set only inside each `main()`. Only `self-test.mjs` is script-only, with its synthetic shaders module-private. So "make the gates callable" is one file, not four — and the synthetic shaders are worth exporting anyway, as fixtures for testing the evaluation tools themselves.

### 5. The CLI is a rewrite, not an extension

`bin/orbic.mjs` dispatches on a single string equality and parses flags in one loop hard-coded for `build-shader`. Its own comment: *"Minimal flag parser — deliberately no dependency for one command."* Honouring that comment means restructuring rather than bolting a second branch onto a parser that documented its own assumption.

## Risks / Trade-offs

- **PNG encoding is unproven.** Nothing in the repo encodes an image; `renderSksl` only reads raw pixels. Spike before the tool contract depends on it. If CanvasKit's encoder is unavailable, raw pixels plus dimensions are a fallback the caller can render.
- **The lint restructure touches a file ten tests depend on.** Messages are interpolated at detection time and each begins with a `line N:` prefix. Ids and text must stay byte-stable; this is a shape change only.
- **`canvaskit-wasm` becomes a runtime dependency.** Today it is a root devDependency used only by evaluation scripts. A server that loads it at runtime changes that classification.
- **Refactoring the gates risks the gates.** They are what everything else trusts. Capture full output before and diff after; a subtle behavioural change here is worse than shipping no server at all.
- **Measurement can mislead as confidently as no measurement.** A tool reporting a plausible wrong number is harder to catch than one that is obviously broken, which is why the tools are validated against defects already known to have occurred rather than only against synthetic inputs.
