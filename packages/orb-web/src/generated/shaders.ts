// GENERATED FILE — DO NOT EDIT.
// Regenerate with `node scripts/build-shaders.mjs`.
//
// Barrel over every field's GLSL sources. Importing this pulls in ALL
// fields by design; import './fields/<name>.js' directly (or the package's
// `fields/<name>` subpath) to bundle only one.

import * as chladni from './fields/chladni.js';
import * as flat_color from './fields/flat-color.js';
import * as ribbons from './fields/ribbons.js';
import * as silk from './fields/silk.js';
import * as veils from './fields/veils.js';

export const FIELD_SHADERS = {
  'chladni': chladni,
  'flat-color': flat_color,
  'ribbons': ribbons,
  'silk': silk,
  'veils': veils,
} as const;

export type FieldName = keyof typeof FIELD_SHADERS;
