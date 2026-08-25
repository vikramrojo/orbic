// Builds real SkSL artifacts for a field, using the project's own
// `buildArtifacts` from `scripts/build-shaders.mjs` (imported, not
// modified) with `compositors.surface` pointed explicitly at the real
// `packages/orb-core/shaders/compositors/surface.orb` rather than
// `placeholder-passthrough.orb`.
//
// This is necessary, not stylistic: as of this writing, both
// `scripts/build-shaders.mjs`'s CLI entry point and
// `scripts/check-shaders.mjs`'s `collectAllArtifacts()` still hardcode
// `placeholder-passthrough.orb` for the surface shape (that one-line fix is
// queued for the other agent, who owns `scripts/**`). Going through the
// default path here would mean every "surface" check in this tool silently
// exercises the placeholder instead of the real compositor -- exactly the
// vacuous-pass failure mode this whole batch is about avoiding.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifacts } from '../../../scripts/build-shaders.mjs';

const libDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(libDir, '..', '..', '..');

const FIELDS_DIR = resolve(rootDir, 'packages/orb-core/shaders/fields');
const COMPOSITORS_DIR = resolve(rootDir, 'packages/orb-core/shaders/compositors');

const orbSource = readFileSync(resolve(COMPOSITORS_DIR, 'orb.orb'), 'utf8');
const realSurfaceSource = readFileSync(resolve(COMPOSITORS_DIR, 'surface.orb'), 'utf8');

/** Names of every shipped field (e.g. "chladni", "silk", "veils", "flat-color"), sorted. */
export function listFields() {
  return readdirSync(FIELDS_DIR)
    .filter((f) => f.endsWith('.orb'))
    .map((f) => f.replace(/\.orb$/, ''))
    .sort();
}

/**
 * Builds all 6 artifacts (2 shapes x 3 targets) for `fieldName`, using the
 * real `orb.orb` and `surface.orb` compositors. Returns the array
 * `buildArtifacts` itself returns (`{ shape, target, fileName, content }[]`).
 */
export function buildRealArtifacts(fieldName) {
  const fieldSource = readFileSync(resolve(FIELDS_DIR, `${fieldName}.orb`), 'utf8');
  return buildArtifacts({
    name: fieldName,
    fieldSource,
    compositors: { orb: orbSource, surface: realSurfaceSource },
  });
}

/** The SkSL source for `fieldName`'s `shape` ("orb" | "surface"), built against the real compositors. */
export function getSksl(fieldName, shape) {
  const artifacts = buildRealArtifacts(fieldName);
  const found = artifacts.find((a) => a.shape === shape && a.target === 'sksl');
  if (!found) {
    throw new Error(`getSksl: no sksl artifact for field "${fieldName}" shape "${shape}"`);
  }
  return found.content;
}
