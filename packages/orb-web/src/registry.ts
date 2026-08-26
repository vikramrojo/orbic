import type { FieldName } from '@orbic/core';

/** A field's GLSL sources, one per shape. */
export interface FieldSources {
  readonly orb: string;
  readonly surface: string;
}

/**
 * Fields available to the renderer at runtime.
 *
 * This exists so the renderer never imports the generated barrel. A barrel
 * import is not tree-shakeable — bundlers cannot drop unused PROPERTIES of an
 * object literal — so if `renderFrame` reached for `FIELD_SHADERS` directly,
 * every consumer would ship the source of every field whether they used one or
 * five (roughly 180 kB of shader text at five fields).
 *
 * The main `@orbic/web` entry point registers everything, so the default
 * experience is unchanged. A consumer who cares about bytes imports from
 * `@orbic/web/minimal` and registers only the fields they use:
 *
 * ```ts
 * import { Orb, registerField } from '@orbic/web/minimal';
 * import chladni from '@orbic/web/fields/chladni';
 *
 * registerField('chladni', chladni);
 * ```
 */
const registry = new Map<string, FieldSources>();

/** Registers a field's sources under `name`, replacing any previous entry. */
export function registerField(name: string, sources: FieldSources): void {
  registry.set(name, sources);
}

/** Registers several at once — what the all-fields entry point uses. */
export function registerFields(fields: Readonly<Record<string, FieldSources>>): void {
  for (const [name, sources] of Object.entries(fields)) {
    registry.set(name, sources);
  }
}

/** Names currently registered, in registration order. */
export function registeredFieldNames(): string[] {
  return [...registry.keys()];
}

/**
 * Sources for a registered field, or `undefined` if it was never registered.
 *
 * `undefined` is a normal outcome, not an error: a consumer using the minimal
 * entry point may legitimately not have registered the field a caller asked
 * for, and the renderer's contract is to fall back to a solid colour rather
 * than crash (platform-renderers spec).
 */
export function fieldSources(name: FieldName | string): FieldSources | undefined {
  return registry.get(name);
}

/** Test seam: empties the registry so a test can exercise the unregistered path. */
export function clearFieldRegistryForTests(): void {
  registry.clear();
}
