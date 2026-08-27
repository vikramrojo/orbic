## 1. Baseline and spikes

- [ ] 1.1 Capture the full stdout of all four render checks to a file, before touching anything — this is the artifact the refactor is diffed against, and it must be taken first
- [ ] 1.2 SPIKE — determine whether CanvasKit can encode a PNG from a rendered surface in this setup. Nothing in the repo encodes an image today. If it cannot, decide the fallback (raw pixels plus dimensions) before any tool contract assumes an image
- [ ] 1.3 Decide `canvaskit-wasm`'s dependency placement once the server is a runtime consumer, not only an evaluation script

## 2. Lint rules as a catalogue

- [ ] 2.1 Restructure the ten rule ids from nine inline `push(...)` sites into one declarative table in `scripts/lint-shader.mjs`, keeping ids and message text byte-identical
- [ ] 2.2 Export the catalogue so rule identity is readable without linting fixtures or scraping source
- [ ] 2.3 Confirm `packages/orb-core/tests/lint-shader.test.ts` passes unmodified — if a test needs editing, the refactor changed behaviour and is wrong
- [ ] 2.4 Re-run `pnpm check-shaders` and confirm all 48 artifacts still lint clean with identical output

## 3. The ABI manifest

- [ ] 3.1 Emit rule ids and messages to JSON from the catalogue
- [ ] 3.2 Author the conventions half: four channels with ranges, the orb-vs-surface applicability table, the two-function signatures, world space, the shims, and that `t` already carries `pulse`
- [ ] 3.3 Add the consistency test asserting every rule id appears in `docs/shader-abi.md`, encoding the `pulse-applied-twice` exception explicitly rather than assuming positional correspondence with the banned-list bullets
- [ ] 3.4 Verify the test FAILS when a rule id is removed from either side — a consistency test that cannot fail is decoration

## 4. The evaluation library

- [ ] 4.1 `radialProfile` — alpha against radius, plus corner alpha, which is what detects a falloff clipped square by the viewport
- [ ] 4.2 `brightnessDecomposition` — straight colour, alpha, and the product over a given background, reported separately
- [ ] 4.3 `featureCount` — distinct rendered features and lit-area fraction
- [ ] 4.4 `channelSweep` — per-channel image difference, orb and surface separately, treating a zero for `pulse` as expected rather than a fault
- [ ] 4.5 `temporalProfile` — per-row brightness across sampled times, distinguishing "features come and go" from "the whole image dims"
- [ ] 4.6 `limbProfile` — luminance and alpha inside versus outside the silhouette
- [ ] 4.7 Build all of the above on `tools/render-check/lib/` (`renderSksl`, `makeUniforms`, `listFields`, `getSksl`, `pixelAt`, `meanAbsDiff`, `lib/color.mjs`) — no new rasterisation code

## 5. Gates callable

- [ ] 5.1 Add exports to `tools/render-check/self-test.mjs` — the four test functions and the synthetic SkSL constants, which double as fixtures for testing the evaluation library
- [ ] 5.2 Leave `checkContrast`, `checkAspectDistortion` and `checkBrandUnity` alone; they are already exported and side-effect free
- [ ] 5.3 Add `pnpm` scripts for the four checks, which the manifest currently lacks — CI invokes them by path
- [ ] 5.4 Diff all four checks' full output against the 1.1 baseline. Identical, or stop

## 6. CLI

- [ ] 6.1 Restructure `parseArgs`/`main`/`USAGE` in `packages/orb-core/bin/orbic.mjs` from single-command dispatch to a subcommand registry, honouring rather than contradicting its "deliberately no dependency for one command" note
- [ ] 6.2 Add `orbic eval` and `orbic probe` over the evaluation library
- [ ] 6.3 Confirm `orbic build-shader` is behaviourally unchanged, including its exit codes — 1 for a failed build, 2 for a usage error — and that its 16 existing tests pass

## 7. MCP server

- [ ] 7.1 Add `@modelcontextprotocol/sdk`; it is absent from the workspace
- [ ] 7.2 Implement `orbic mcp` exposing the evaluation library, with no tool that generates or edits shader source
- [ ] 7.3 Return structured measurements and, for rasterising tools, the render
- [ ] 7.4 State in each image-returning tool's description that the image only helps a vision-capable consumer
- [ ] 7.5 Verify `tools/list` enumerates the verbs and each tool round-trips, including a decodable image

## 8. Validate the tools against known defects

- [ ] 8.1 Reproduce a sparse field's peak-to-mean ratio near 46, identifying sparseness rather than dimness
- [ ] 8.2 Reproduce a field clipping at exactly peak 1.000
- [ ] 8.3 Reproduce the orb compositor's mean alpha across the disc
- [ ] 8.4 Reproduce a dotted field's feature count and confirm it distinguishes ~8 from ~100
- [ ] 8.5 Confirm the channel sweep flags a field ignoring a channel, and reports `pulse` at zero as expected

## 9. Documentation

- [ ] 9.1 Write `SKILL.md` covering the available measurements and the traps that have actually caused defects — this would be the repo's first non-OpenSpec skill
- [ ] 9.2 Document the MCP server in the README, including how to register it
- [ ] 9.3 Cross-link from `docs/custom-fields.md`, whose "Is each channel actually doing something?" section currently tells the reader to copy a gate probe and alias filenames by hand
