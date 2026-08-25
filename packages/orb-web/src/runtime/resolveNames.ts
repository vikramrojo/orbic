import { PRESET_NAMES } from '@orbic/core';
import type { PresetName } from '@orbic/core';
import { FIELD_SHADERS } from '../generated/shaders.js';
import type { FieldName } from '../generated/shaders.js';

export const FIELD_NAMES = Object.keys(FIELD_SHADERS) as FieldName[];

const FALLBACK_STATE: PresetName = 'subtle';
const FALLBACK_FIELD: FieldName = FIELD_NAMES[0]!;

export type Warn = (message: string) => void;

export interface NameContext {
  /** e.g. "<Orb>" or "<Surface>" */
  component: string;
  /** e.g. "state" (Orb) or "preset" (Surface) — same underlying preset name, different prop name per component. */
  prop: string;
}

const ORB_STATE_CONTEXT: NameContext = { component: '<Orb>', prop: 'state' };
const ORB_FIELD_CONTEXT: NameContext = { component: '<Orb>', prop: 'field' };

/**
 * Resolves a `state`/`preset` prop to a known preset name, falling back to
 * `subtle` with a warning naming the invalid value and the valid options —
 * never throws, so a typo never stops rendering. Shared by `<Orb>`'s
 * `state` and `<Surface>`'s `preset` (orb-component and surface-component
 * specs both require this exact fallback behaviour); `context` only
 * changes the wording of the warning.
 */
export function resolveStateName(name: string, warn: Warn = console.warn, context: NameContext = ORB_STATE_CONTEXT): PresetName {
  if ((PRESET_NAMES as readonly string[]).includes(name)) {
    return name as PresetName;
  }
  warn(
    `Orbic ${context.component}: unknown ${context.prop} "${name}" — valid options are ${PRESET_NAMES.join(', ')}. Falling back to "${FALLBACK_STATE}".`
  );
  return FALLBACK_STATE;
}

/**
 * Resolves a `field` prop to a known shipped field, falling back to the
 * first shipped field with a warning naming the invalid value and the
 * valid options. Shared by `<Orb>` and `<Surface>`.
 */
export function resolveFieldName(name: string, warn: Warn = console.warn, context: NameContext = ORB_FIELD_CONTEXT): FieldName {
  if ((FIELD_NAMES as readonly string[]).includes(name)) {
    return name as FieldName;
  }
  warn(
    `Orbic ${context.component}: unknown ${context.prop} "${name}" — valid options are ${FIELD_NAMES.join(', ')}. Falling back to "${FALLBACK_FIELD}".`
  );
  return FALLBACK_FIELD;
}
