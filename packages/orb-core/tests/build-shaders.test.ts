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

describe('orb.orb — sphere geometry, no white rim', () => {
  it('has no additive rim term', () => {
    // The old rim ADDED to colour, which read as a hard white outline stamped
    // on the background. Fresnel here drives alpha instead, so the guard is
    // that nothing lifts the colour toward white in the compositor.
    expect(orbCompositorSource).not.toMatch(/ORB_RIM/);
    expect(orbCompositorSource).not.toMatch(/litColor/);
    expect(orbCompositorSource).not.toMatch(/color\s*\+/);
  });

  it('drives alpha from the sphere height, not a radial ramp', () => {
    // z = sqrt(1 - r^2) is the curvature: flat across the face, plunging at
    // the limb. A linear/smoothstep radial ramp is steepest in the MIDDLE,
    // which is why an earlier version read as fog rather than a ball.
    expect(orbCompositorSource).toMatch(/sqrt\(max\(1\.0 - r \* r, 0\.0\)\)/);
  });

  it('applies Fresnel to density rather than to colour', () => {
    expect(orbCompositorSource).toMatch(/fresnel\s*=\s*pow\(1\.0 - z/);
    expect(orbCompositorSource).toMatch(/density\s*=\s*mix\(ORB_CORE_ALPHA, 1\.0, fresnel\)/);
  });

  it('keeps a transparent core, so the orb reads as glass rather than a disc', () => {
    const core = Number(orbCompositorSource.match(/ORB_CORE_ALPHA\s*=\s*([0-9.]+)/)![1]);
    expect(core).toBeGreaterThan(0);
    expect(core).toBeLessThan(1);
  });

  it('keeps the feathered limb inside the viewport', () => {
    // World space is normalised by min(resolution), so 0.5 is exactly the
    // half-extent along each axis while the corners reach ~0.707. A
    // silhouette still carrying alpha at 0.5 would be cut flat against the
    // sides and continue into the corners — a square halo.
    const radius = Number(orbCompositorSource.match(/ORB_RADIUS\s*=\s*([0-9.]+)/)![1]);
    const feather = Number(orbCompositorSource.match(/ORB_LIMB_FEATHER\s*=\s*([0-9.]+)/)![1]);
    expect(radius + feather).toBeLessThanOrEqual(0.5);
  });

  it('keeps the feather narrow, so the silhouette stays round rather than foggy', () => {
    const feather = Number(orbCompositorSource.match(/ORB_LIMB_FEATHER\s*=\s*([0-9.]+)/)![1]);
    expect(feather).toBeLessThan(0.08);
  });
});

describe('epilogue-orb — the `edge` and `backlight` uniforms', () => {
  const epilogue = (target: string) =>
    readFileSync(resolve(shadersDir, `targets/epilogue-orb.${target}`), 'utf8');

  it('declares both uniforms on the GLSL and SkSL targets', () => {
    for (const target of ['glsl', 'sksl']) {
      expect(epilogue(target)).toMatch(/uniform float u_edge;/);
      expect(epilogue(target)).toMatch(/uniform float u_backlight;/);
    }
  });

  it('carries both as trailing Metal arguments, in declaration order', () => {
    // Swift passes these positionally, so the order is load-bearing.
    expect(epilogue('metal')).toMatch(/float pulse,\s*\n\s*float edge,\s*\n\s*float backlight\s*\n\s*\)/);
  });

  it('works `edge` in the feather coordinate, not in alpha space', () => {
    // With a transparent core the interior sits near alpha 0.42 while the
    // feather sweeps 0.6 down to 0 — the ranges OVERLAP, so an alpha-space
    // remap cannot tell them apart and hollows out the orb instead of
    // tightening its edge. This is the regression guard for that.
    for (const target of ['glsl', 'sksl', 'metal']) {
      expect(epilogue(target)).toMatch(/baseSilhouette\s*=\s*1\.0 - smoothstep\(0\.0, 1\.0, u\)/);
      expect(epilogue(target)).toMatch(/sharpSilhouette \/ max\(baseSilhouette/);
    }
  });

  it('leaves interior density untouched at any edge, since u = 0 there', () => {
    for (const target of ['glsl', 'sksl', 'metal']) {
      expect(epilogue(target)).toMatch(/mix\(1\.0, sharpSilhouette \/ max\(baseSilhouette, 1e-4\), (u_)?edge\)/);
    }
  });

  it('tints the backlight by the field colour rather than blowing out to white', () => {
    for (const target of ['glsl', 'sksl', 'metal']) {
      expect(epilogue(target)).toMatch(/glowColor = mix\(straight, (vec3|float3)\(1\.0\), 0\.35\)/);
    }
  });

  it('gives the backlight its own alpha, so it can exist outside the body', () => {
    for (const target of ['glsl', 'sksl', 'metal']) {
      expect(epilogue(target)).toMatch(/outAlpha = clamp\(alpha \+ glow \* \(1\.0 - alpha\)/);
    }
  });

  it('un-premultiplies before touching alpha, with a divide-by-zero guard', () => {
    for (const target of ['glsl', 'sksl', 'metal']) {
      expect(epilogue(target)).toMatch(/composited\.rgb\s*\/\s*max\(composited\.a,/);
    }
  });
});
