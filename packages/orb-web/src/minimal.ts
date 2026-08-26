/**
 * Everything `@orbic/web` offers EXCEPT the fields themselves.
 *
 * The main entry point registers every shipped field, which is convenient and
 * costs roughly 180 kB of shader source at five fields. Import from here
 * instead and register only what you use:
 *
 * ```ts
 * import { Orb, registerField } from '@orbic/web/minimal';
 * import chladni from '@orbic/web/fields/chladni';
 *
 * registerField('chladni', chladni);
 * ```
 *
 * An unregistered field is not an error: the renderer degrades to its flat
 * fallback colour, the same as it does for a shader that fails to compile.
 */
export { Orb } from './Orb.js';
export type { OrbProps } from './Orb.js';

export { Surface } from './Surface.js';
export type { SurfaceProps } from './Surface.js';

export { registerField, registerFields, registeredFieldNames } from './registry.js';
export type { FieldSources } from './registry.js';

export { sharedGLContext, SharedGLContext } from './gl/sharedContext.js';
export { OrbRuntime } from '@orbic/core';
export type { OrbUniforms, FieldName } from '@orbic/core';
export { resolveFieldName, resolveStateName } from '@orbic/core';
export { cappedDevicePixelRatio, drawingBufferSize, MAX_DEVICE_PIXEL_RATIO } from './runtime/dpr.js';
