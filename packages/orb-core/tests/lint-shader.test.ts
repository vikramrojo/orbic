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

describe('pulse-applied-twice', () => {
  // The runtime accumulates the field clock as the integral of pulse * dt, so
  // a field that multiplies again gets pulse^2. This shipped in all three
  // fields before the task 3.5 ABI gate caught it; the rule exists so it
  // cannot come back, including for custom fields built via the CLI.
  const rules = (source: string) => lintShaderSource(source).map((v) => v.rule);

  it('flags `t * pulse`', () => {
    expect(rules('float clock = t * pulse;')).toContain('pulse-applied-twice');
  });

  it('flags the reversed operand order', () => {
    expect(rules('float clock = pulse * t;')).toContain('pulse-applied-twice');
  });

  it('flags the compound form', () => {
    expect(rules('t *= pulse;')).toContain('pulse-applied-twice');
  });

  it('does not chase the value through a copy, and says so', () => {
    // `float c = t; c *= pulse;` is the same bug but needs dataflow analysis
    // to see. This is a regex linter, so that case is knowingly out of reach —
    // the rule catches the shape every shipped field actually used.
    expect(rules('float c = t; c *= pulse;')).not.toContain('pulse-applied-twice');
  });

  it('allows `t` used directly', () => {
    expect(rules('float clock = t;')).not.toContain('pulse-applied-twice');
  });

  it('allows pulse used as a non-timing cue', () => {
    // pulse stays in the signature and may modulate amplitude — it just must
    // never scale t.
    expect(rules('float amp = pulse * 0.5;')).not.toContain('pulse-applied-twice');
    expect(rules('float amp = energy * pulse;')).not.toContain('pulse-applied-twice');
  });

  it('does not flag identifiers that merely contain t or pulse', () => {
    expect(rules('float x = tint * pulseWidth;')).not.toContain('pulse-applied-twice');
  });
});
