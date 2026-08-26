export {
  FIXED_SUBSTEP,
  MAX_FRAME_DELTA,
  createSpringState,
  integrateSpring,
} from './spring.js';
export type { SpringParams, SpringState, AccumulatingSpringState } from './spring.js';

export {
  CHANNELS,
  PRESET_NAMES,
  presets,
  springs,
  transitionKey,
  resolveSpring,
  presetChannels,
} from './states.js';
export type { Channel, PresetName, ChannelValues } from './states.js';

export { OrbRuntime } from './OrbRuntime.js';
export type { OrbUniforms } from './OrbRuntime.js';

export { FIELD_NAMES, resolveFieldName, resolveStateName } from './resolveNames.js';
export type { FieldName, NameContext, Warn } from './resolveNames.js';

export { fallbackColorFromChannels } from './fallbackColor.js';
