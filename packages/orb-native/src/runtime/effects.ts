import { Skia } from '@shopify/react-native-skia';
import type { SkRuntimeEffect } from '@shopify/react-native-skia';

import { FIELD_SHADERS } from '../generated/shaders.js';
import type { FieldName } from '../generated/shaders.js';

export type Shape = 'orb' | 'surface';

/**
 * Compiled `SkRuntimeEffect` cache, keyed by field and shape.
 *
 * Compiling SkSL is not free and the source never changes at runtime, so each
 * field/shape pair is compiled at most once per process — the Skia analogue
 * of the web bundle's one-shared-context, one-compile-per-shader rule
 * (platform-renderers spec).
 */
const effects = new Map<string, SkRuntimeEffect | null>();

/** Field/shape pairs already reported as failing, so the diagnostic is emitted once rather than per frame. */
const reported = new Set<string>();

function key(field: FieldName, shape: Shape): string {
  return `${field}:${shape}`;
}

/**
 * Returns the compiled effect for a field/shape, or `null` if the shader
 * fails to compile on this device.
 *
 * A shader that compiled in CI can still be rejected by a specific driver, so
 * the caller's contract is to fall back to a solid colour rather than crash or
 * render nothing (platform-renderers spec). The failure is logged once, and
 * `null` is cached so compilation is not retried every frame.
 */
export function runtimeEffect(field: FieldName, shape: Shape): SkRuntimeEffect | null {
  const cacheKey = key(field, shape);

  const cached = effects.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const source = FIELD_SHADERS[field]?.[shape];
  if (source === undefined) {
    effects.set(cacheKey, null);
    return null;
  }

  // Skia returns null rather than throwing on a compile failure.
  const effect = Skia.RuntimeEffect.Make(source) ?? null;
  effects.set(cacheKey, effect);

  if (effect === null && !reported.has(cacheKey)) {
    reported.add(cacheKey);
    (globalThis as { console?: { error?: (m: string) => void } }).console?.error?.(
      `Orbic: SkSL for field "${field}" (${shape}) failed to compile on this device. ` +
        'Rendering the flat fallback colour instead.'
    );
  }

  return effect;
}

/** Test seam: clears the compile cache so a test can exercise the failure path. */
export function resetEffectCacheForTests(): void {
  effects.clear();
  reported.clear();
}
