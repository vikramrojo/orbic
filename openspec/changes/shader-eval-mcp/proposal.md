## Why

Every shader defect this project has shipped passed every automated check. The blur that replaced the sphere, the flat green disc, eight dots where a hundred were intended, four fields rendering three to thirty times too dark — all lint-clean, all compiled through real Skia, all passing contrast, aspect and brand-unity. Each was caught by a human looking at the screen, and diagnosed only after a throwaway measurement script was written for that one occasion and then discarded.

The conformance layer is mature. The perception layer does not exist. An agent authoring a field today can prove it is *legal* and cannot tell whether it is *right*.

## What Changes

- New evaluation library promoting six ad-hoc probes — radial profile, limb/spill, brightness decomposition, feature count, temporal profile, channel sweep — into tested functions over the existing `tools/render-check/lib/` surface. No new rasterisation code.
- New MCP server exposing those probes as evaluation tools, returning structured measurements **and** a rendered PNG. Orbic rasterises through Skia in-process, so this needs no browser.
- The same verbs available as `orbic eval` / `orbic probe` subcommands, which requires restructuring `bin/orbic.mjs` from its current single-command dispatch.
- The portable subset's ten lint rules restructured from inline `push(...)` sites into a declarative table, so rule ids and messages emit as machine-readable JSON. The code that enforces the subset becomes the source of truth for describing it.
- A `SKILL.md` for shader evaluation, alongside the JSON rather than generated from it.
- A consistency test asserting every rule id in the JSON appears in `docs/shader-abi.md`.
- `self-test.mjs` gains exports. The other three checks already have callable per-item functions and are left alone.
- **NOT in scope: authoring.** Nothing here generates shader code. The portable subset is small and the linter rejects violations instantly — writing GLSL was never the bottleneck.
- **NOT in scope: a shader package split.** Shaders stay in `packages/orb-core/shaders/`.

### Constraints accepted as scope boundaries

- `docs/shader-abi.md` is FROZEN. The JSON describes the contract; it does not redefine it, and the prose stays the authored source for reasoning a manifest cannot hold.
- Rendered images only help a vision-capable consumer. Tool descriptions must say so rather than implying every caller benefits.
- The existing four gates must behave identically after any refactor. They are the checks everything else trusts.

## Capabilities

### New Capabilities

- `shader-evaluation`: Measure what a rendered field actually looks like — brightness, feature density, silhouette profile, temporal behaviour, channel observability — as callable functions.
- `shader-abi-manifest`: Publish the portable subset and channel contract as machine-readable data derived from the code that enforces it.
- `shader-eval-mcp-server`: Expose evaluation over MCP and the CLI, returning measurements and renders.

### Modified Capabilities

- `shader-build-pipeline`: The lint rules gain a declarative structure and a public catalogue, without changing what they reject.

## Impact

- `scripts/lint-shader.mjs` — restructured, ids and messages byte-stable. Ten tests in `packages/orb-core/tests/lint-shader.test.ts` assert one case per rule id.
- `packages/orb-core/bin/orbic.mjs` — rewritten dispatch; its own comment notes the parser was "deliberately no dependency for one command".
- `tools/render-check/self-test.mjs` — gains exports; its synthetic shaders become reusable fixtures.
- New dependency: `@modelcontextprotocol/sdk`, absent from the workspace today. `canvaskit-wasm` moves from an evaluation-only devDependency to a runtime one.
- `orbic-foundation` is untouched.
