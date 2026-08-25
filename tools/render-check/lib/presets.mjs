// Reads the shipped presets straight from
// `packages/orb-core/src/presets.json` (read, never modified) rather than
// duplicating the five preset channel values here, so this tool can't drift
// from the actual source of truth.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(libDir, '..', '..', '..');
const presetsPath = resolve(rootDir, 'packages/orb-core/src/presets.json');

const raw = JSON.parse(readFileSync(presetsPath, 'utf8'));

/** `{ subtle: {energy, coherence, warmth, pulse}, active: {...}, ... }`. */
export const PRESETS = raw.presets;

/** Preset names in the order they appear in `presets.json`. */
export const PRESET_NAMES = Object.keys(raw.presets);
