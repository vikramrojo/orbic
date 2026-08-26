/**
 * The all-fields entry point: importing this registers every shipped field, so
 * `<Orb field="anything" />` just works.
 *
 * That convenience has a cost — every field's shader source ends up in the
 * bundle, since the side-effecting registration below references them all.
 * `@orbic/web/minimal` is the same API without it; see registry.ts.
 */
import { FIELD_SHADERS } from './generated/shaders.js';
import { registerFields } from './registry.js';

registerFields(FIELD_SHADERS);

export * from './minimal.js';

export { FIELD_SHADERS } from './generated/shaders.js';
