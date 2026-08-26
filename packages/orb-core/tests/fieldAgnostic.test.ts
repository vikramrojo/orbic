import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIELD_NAMES } from '../src/generated/fields.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fieldsDir = resolve(repoRoot, 'packages/orb-core/shaders/fields');
const appSource = readFileSync(resolve(repoRoot, 'examples/web/src/App.tsx'), 'utf8');

/**
 * The harness has to field ANY number of shader builds, not the ones it
 * happened to ship with. A custom `.orb` dropped into the fields directory
 * must appear in the example app's switcher, gallery and playground with no
 * edit to the app — so the app must not name fields.
 */
describe('the example harness is field-agnostic', () => {
  it('derives its field list from the generated FIELD_NAMES', () => {
    expect(appSource).toMatch(/import \{[^}]*FIELD_NAMES[^}]*\} from '@orbic\/core'/);
  });

  it('names no shipped field except the placeholder it deliberately filters', () => {
    // `flat-color` is excluded on purpose (it is the pipeline-proof
    // placeholder, not a field to judge aesthetically), so it is the one name
    // allowed to appear.
    const code = appSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const field of FIELD_NAMES) {
      if (field === 'flat-color') continue;
      expect(code, `App.tsx hardcodes the field "${field}"`).not.toMatch(
        new RegExp(`['"\`]${field}['"\`]`)
      );
    }
  });

  it('keeps FIELD_NAMES in step with the fields directory', () => {
    const onDisk = readdirSync(fieldsDir)
      .filter((f) => f.endsWith('.orb'))
      .map((f) => f.replace(/\.orb$/, ''))
      .sort();
    expect([...FIELD_NAMES]).toEqual(onDisk);
  });

  it('keeps the list sorted, since FIELD_NAMES[0] is every platform’s fallback', () => {
    // A field named to sort before the current first entry would silently
    // become the fallback for an unrecognised name on web, native and Swift.
    expect([...FIELD_NAMES]).toEqual([...FIELD_NAMES].sort());
  });
});

describe('docs/custom-fields.md documents commands that exist', () => {
  const doc = readFileSync(resolve(repoRoot, 'docs/custom-fields.md'), 'utf8');
  const rootManifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));

  it('only references root scripts that are actually defined', () => {
    // The doc told people to run `pnpm orbic build-shader` before that script
    // existed; this stops the instructions drifting from the manifest again.
    const referenced = [...doc.matchAll(/pnpm (?:run )?([a-z][a-z0-9:-]*)/g)]
      .map((m) => m[1]!)
      .filter((name) => name !== 'install' && name !== 'dev' && name !== 'exec');

    for (const script of new Set(referenced)) {
      expect(rootManifest.scripts, `docs reference \`pnpm ${script}\``).toHaveProperty(script);
    }
  });

  it('points at render-check scripts that exist on disk', () => {
    for (const match of doc.matchAll(/tools\/render-check\/([a-z-]+\.mjs)/g)) {
      const file = resolve(repoRoot, 'tools/render-check', match[1]!);
      expect(() => readFileSync(file), `docs reference ${match[1]}`).not.toThrow();
    }
  });
});
