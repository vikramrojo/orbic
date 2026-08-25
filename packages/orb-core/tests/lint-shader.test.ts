import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain JS module, not part of the orb-core TS project.
import { lintShaderSource } from '../../../scripts/lint-shader.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, 'fixtures/invalid-shaders');
const shadersDir = resolve(here, '../shaders');

function readFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), 'utf8');
}

describe('lintShaderSource — rejects each banned construct with a specific message', () => {
  it('rejects texture sampling', () => {
    const violations = lintShaderSource(readFixture('texture-sampling.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'texture-sampling')).toBe(true);
    expect(violations[0].message).toMatch(/texture sampling/i);
  });

  it('rejects discard', () => {
    const violations = lintShaderSource(readFixture('discard.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'discard')).toBe(true);
    expect(violations[0].message).toMatch(/`discard`/);
  });

  it('rejects while loops', () => {
    const violations = lintShaderSource(readFixture('while-loop.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'while-loop')).toBe(true);
    expect(violations[0].message).toMatch(/`while`/);
  });

  it('rejects bare mod(', () => {
    const violations = lintShaderSource(readFixture('bare-mod.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'bare-mod')).toBe(true);
    expect(violations[0].message).toMatch(/oMod/);
  });

  it('rejects two-argument atan(', () => {
    const violations = lintShaderSource(readFixture('two-arg-atan.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'two-arg-atan')).toBe(true);
    expect(violations[0].message).toMatch(/oAtan2/);
  });

  it('rejects dynamic array indexing', () => {
    const violations = lintShaderSource(readFixture('dynamic-index.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'dynamic-index')).toBe(true);
    expect(violations[0].message).toMatch(/compile-time constant/);
  });

  it('rejects an unbounded for loop', () => {
    const violations = lintShaderSource(readFixture('unbounded-for.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'unbounded-for')).toBe(true);
    expect(violations[0].message).toMatch(/compile-time constant/);
  });

  it('rejects preprocessor directives', () => {
    const violations = lintShaderSource(readFixture('preprocessor.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'preprocessor-directive')).toBe(true);
    expect(violations[0].message).toMatch(/preprocessor/);
  });

  it('rejects uniform declarations', () => {
    const violations = lintShaderSource(readFixture('uniform-declaration.orb'));
    expect(violations.some((v: { rule: string }) => v.rule === 'uniform-declaration')).toBe(true);
    expect(violations[0].message).toMatch(/uniform/);
  });

  it('every fixture in the invalid-shaders directory produces at least one violation', () => {
    const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.orb'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const violations = lintShaderSource(readFixture(file));
      expect(violations.length, `${file} should have produced at least one violation`).toBeGreaterThan(0);
    }
  });
});

describe('lintShaderSource — accepts the portable subset', () => {
  it('accepts the placeholder field with zero violations', () => {
    const source = readFileSync(resolve(shadersDir, 'fields/flat-color.orb'), 'utf8');
    expect(lintShaderSource(source)).toEqual([]);
  });

  it('accepts the placeholder compositor with zero violations', () => {
    const source = readFileSync(resolve(shadersDir, 'compositors/placeholder-passthrough.orb'), 'utf8');
    expect(lintShaderSource(source)).toEqual([]);
  });

  it('does not false-positive on prose that merely mentions banned constructs in comments', () => {
    const source = `
      // This comment mentions discard, while, mod(, atan(, uniform, and texture(
      // purely as prose, none of it is real code.
      vec3 field(vec2 p, float t, float energy, float coherence, float warmth, float pulse) {
          return vec3(energy);
      }
    `;
    expect(lintShaderSource(source)).toEqual([]);
  });
});
