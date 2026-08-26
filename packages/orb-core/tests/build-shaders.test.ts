import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain JS module, not part of the orb-core TS project.
import {
  SHAPES,
  TARGETS,
  applyMetalProgramScopeConstants,
  applyMetalTypeAliases,
  buildArtifacts,
} from '../../../scripts/build-shaders.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const shadersDir = resolve(here, '../shaders');

const fieldSource = readFileSync(resolve(shadersDir, 'fields/flat-color.orb'), 'utf8');
const compositorSource = readFileSync(resolve(shadersDir, 'compositors/placeholder-passthrough.orb'), 'utf8');
const orbCompositorSource = readFileSync(resolve(shadersDir, 'compositors/orb.orb'), 'utf8');

describe('buildArtifacts', () => {
  it('builds all six artifacts (2 shapes x 3 targets) for the placeholder field', () => {
    const artifacts = buildArtifacts({
      name: 'flat-color',
      fieldSource,
      compositors: { orb: compositorSource, surface: compositorSource },
    });

    expect(artifacts).toHaveLength(SHAPES.length * TARGETS.length);
    for (const shape of SHAPES) {
      for (const target of TARGETS) {
        expect(artifacts.some((a: { shape: string; target: string }) => a.shape === shape && a.target === target)).toBe(
          true
        );
      }
    }
  });

  it('every artifact contains the field and compositor call, with the metal target using aliased floatN signatures', () => {
    const artifacts = buildArtifacts({
      name: 'flat-color',
      fieldSource,
      compositors: { orb: compositorSource, surface: compositorSource },
    });

    for (const artifact of artifacts) {
      expect(artifact.content).toContain('field(');
      expect(artifact.content).toContain('composite(');
      if (artifact.target === 'metal') {
        // The core's own function signatures must be aliased (checked
        // directly, not by scanning the whole file — the hand-authored
        // Metal epilogue's doc comment legitimately says "GLSL `vec4`" in
        // prose, which a whole-file scan would wrongly flag).
        expect(artifact.content).toContain('float3 field(float2 p,');
        expect(artifact.content).toContain('float4 composite(float2 p,');
        expect(artifact.content).not.toContain('vec3 field(');
        expect(artifact.content).not.toContain('vec4 composite(');
      } else {
        expect(artifact.content).toContain('vec3 field(vec2 p,');
        expect(artifact.content).toContain('vec4 composite(vec2 p,');
      }
    }
  });

  it('throws and writes nothing when the field fails lint', () => {
    const invalidField = 'vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) { discard; return vec3(energy); }';
    expect(() =>
      buildArtifacts({
        name: 'invalid',
        fieldSource: invalidField,
        compositors: { orb: compositorSource, surface: compositorSource },
      })
    ).toThrow(/lint failed/);
  });

  it('throws when a compositor fails lint, even if the field is clean', () => {
    const invalidCompositor =
      'vec4 composite(vec2 p, float t, float energy, float coherence, float warmth, float pulse) { uniform float leaked; return vec4(1.0); }';
    expect(() =>
      buildArtifacts({
        name: 'invalid',
        fieldSource,
        compositors: { orb: invalidCompositor, surface: compositorSource },
      })
    ).toThrow(/lint failed/);
  });
});

describe('orb.orb — the real orb compositor (task 5.1)', () => {
  it('builds all six artifacts and passes lint (used for the surface slot too, in this assertion, to isolate orb.orb itself)', () => {
    const artifacts = buildArtifacts({
      name: 'flat-color',
      fieldSource,
      compositors: { orb: orbCompositorSource, surface: orbCompositorSource },
    });
    expect(artifacts).toHaveLength(SHAPES.length * TARGETS.length);
  });

  it('returns premultiplied colour and alpha (`vec4(rgb * a, a)`), not just `vec4(rgb, 1.0)`', () => {
    // The placeholder returns `vec4(color, 1.0)`, which is identical
    // whether read as premultiplied or straight alpha, so it never
    // exercises this. The real compositor must actually multiply colour by
    // alpha before returning, or backgrounds show dark fringing at the rim.
    expect(orbCompositorSource).toMatch(/return vec4\(\s*\w+\s*\*\s*alpha\s*,\s*alpha\s*\)/);
  });

  it('masks alpha to (effectively) zero outside the sphere radius', () => {
    // Static, not rendered: confirms the mask formula structurally reaches
    // 0 beyond the radius, via smoothstep saturating past its upper edge.
    expect(orbCompositorSource).toMatch(/1\.0\s*-\s*smoothstep\(/);
  });

  it('the orb-shape artifacts (all 3 targets) contain the real sphere-mask logic, not the placeholder passthrough', () => {
    const artifacts = buildArtifacts({
      name: 'flat-color',
      fieldSource,
      compositors: { orb: orbCompositorSource, surface: compositorSource },
    });
    for (const artifact of artifacts.filter((a: { shape: string }) => a.shape === 'orb')) {
      expect(artifact.content).toContain('smoothstep');
      expect(artifact.content).not.toContain('return vec4(color, 1.0);');
      expect(artifact.content).not.toContain('return float4(color, 1.0);');
    }
    for (const artifact of artifacts.filter((a: { shape: string }) => a.shape === 'surface')) {
      expect(artifact.content).not.toContain('smoothstep');
    }
  });
});

describe('applyMetalTypeAliases', () => {
  it('maps GLSL vecN/matN to Metal floatN/floatNxN', () => {
    const source = 'vec2 a; vec3 b; vec4 c; mat2 d; mat3 e; mat4 f;';
    const aliased = applyMetalTypeAliases(source);
    expect(aliased).toBe('float2 a; float3 b; float4 c; float2x2 d; float3x3 e; float4x4 f;');
  });

  it('does not mangle identifiers that merely contain a type name as a substring', () => {
    const source = 'float vec2Count = 1.0; float notavec3 = 2.0;';
    const aliased = applyMetalTypeAliases(source);
    expect(aliased).toBe(source);
  });
});

describe('applyMetalProgramScopeConstants', () => {
  // Metal rejects `const` at program scope outright ("program scope variable
  // must reside in constant address space"), so every field declaring a named
  // constant outside a function produced a .metal artifact that could not
  // compile. Nothing caught it because no Metal compiler ran in this repo.
  it('rewrites program-scope const to the constant address space', () => {
    const out = applyMetalProgramScopeConstants('const float ORB_SCALE = 1.0;');
    expect(out).toBe('constant float ORB_SCALE = 1.0;');
  });

  it('leaves function-local const alone, which is already valid Metal', () => {
    const source = ['float f() {', '    const float x = 2.0;', '    return x;', '}'].join('\n');
    expect(applyMetalProgramScopeConstants(source)).toBe(source);
  });

  it('does not follow braces that only appear inside comments', () => {
    const source = ['// opens a brace { but never closes it', 'const float A = 1.0;'].join('\n');
    expect(applyMetalProgramScopeConstants(source)).toContain('constant float A');
  });

  it('leaves identifiers that merely start with const untouched', () => {
    const source = 'float constant_factor = 1.0;\nfloat constants = 2.0;';
    expect(applyMetalProgramScopeConstants(source)).toBe(source);
  });

  it('emits no program-scope bare const in any generated Metal artifact', () => {
    const artifacts = buildArtifacts({
      name: 'flat-color',
      fieldSource,
      compositors: { orb: orbCompositorSource, surface: compositorSource },
    });

    for (const artifact of artifacts.filter((a) => a.target === 'metal')) {
      const offenders = artifact.content.split('\n').filter((line) => /^const\s/.test(line));
      expect(offenders).toEqual([]);
    }
  });
});

describe('orb.orb — soft falloff, no rim', () => {
  it('has no rim term at all', () => {
    // The rim was removed rather than turned down, so that a future tweak
    // cannot quietly reintroduce a lit-sphere highlight.
    expect(orbCompositorSource).not.toMatch(/ORB_RIM/);
    expect(orbCompositorSource).not.toMatch(/litColor/);
  });

  it('fades to zero at or before the viewport half-extent', () => {
    // World space is normalised by min(resolution), so 0.5 is exactly the
    // viewport edge along each axis while the corners reach ~0.707. A
    // falloff still carrying alpha at 0.5 would be cut flat against the
    // sides and continue into the corners — a square halo, not a round one.
    const match = orbCompositorSource.match(/ORB_FADE_RADIUS\s*=\s*([0-9.]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(0.5);
  });

  it('starts fading before it ends, so the edge is soft rather than cut', () => {
    const core = Number(orbCompositorSource.match(/ORB_CORE_RADIUS\s*=\s*([0-9.]+)/)![1]);
    const fade = Number(orbCompositorSource.match(/ORB_FADE_RADIUS\s*=\s*([0-9.]+)/)![1]);
    expect(core).toBeLessThan(fade);
    // A band this wide is what distinguishes the new look from the old
    // 0.04-wide cut at radius 0.5.
    expect(fade - core).toBeGreaterThan(0.1);
  });
});

describe('epilogue-orb — the `edge` uniform', () => {
  const epilogue = (target: string) =>
    readFileSync(resolve(shadersDir, `targets/epilogue-orb.${target}`), 'utf8');

  it('declares the uniform on the GLSL and SkSL targets', () => {
    expect(epilogue('glsl')).toMatch(/uniform float u_edge;/);
    expect(epilogue('sksl')).toMatch(/uniform float u_edge;/);
  });

  it('carries edge as a trailing Metal argument, since MSL has no uniform globals', () => {
    const metal = epilogue('metal');
    // Trailing matters: Swift passes these positionally.
    expect(metal).toMatch(/float pulse,\s*\n\s*float edge\s*\n\s*\)/);
  });

  it('is an exact pass-through at edge = 0 on every target', () => {
    // mix(a, firmed, 0) === a. Mixing the RESULT rather than the smoothstep
    // bounds is what makes that exact — smoothstep(0, 1, a) would already be
    // an S-curve, silently reshaping every orb that never set the prop.
    for (const target of ['glsl', 'sksl', 'metal']) {
      expect(epilogue(target)).toMatch(/mix\(composited\.a,\s*firmed,\s*(u_)?edge\)/);
    }
  });

  it('un-premultiplies before changing alpha, with a divide-by-zero guard', () => {
    for (const target of ['glsl', 'sksl', 'metal']) {
      expect(epilogue(target)).toMatch(/composited\.rgb\s*\/\s*max\(composited\.a,/);
    }
  });
});
