import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain JS module, not part of the orb-core TS project.
import { SHAPES, TARGETS, applyMetalTypeAliases, buildArtifacts } from '../../../scripts/build-shaders.mjs';

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
