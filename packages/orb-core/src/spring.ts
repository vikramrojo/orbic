// The `'worklet'` directives in this file let `@orbic/native` run this exact
// integrator on Reanimated's UI thread. Reanimated worklets cannot call plain
// imported functions, so without them the native bundle would have to keep
// its own copy of the spring maths — and the golden-frame fixture exists
// precisely to stop the platforms drifting like that. The directive is a bare
// string-literal statement, so it is inert everywhere else: Node, the browser
// and Vitest all just evaluate and discard it.

export interface SpringParams {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

export interface SpringState {
  readonly value: number;
  readonly velocity: number;
}

export interface AccumulatingSpringState extends SpringState {
  readonly accumulator: number;
}

/** Fixed substep, in seconds, per the spec: semi-implicit Euler at 1/120 s. */
export const FIXED_SUBSTEP = 1 / 120;

/**
 * Upper bound on the real time a single `integrateSpring` call will advance,
 * in seconds (30 substeps). This is part of the specified formulation, not a
 * per-platform detail: a backgrounded tab, a debugger pause, or a slow first
 * paint can hand the integrator a huge delta, and without a shared clamp one
 * platform could spiral through thousands of substeps in a single call while
 * another platform clamps differently (or not at all) — silently breaking
 * the cross-platform golden-frame conformance this integrator exists for.
 * Every platform's integrator must clamp at exactly this value.
 */
export const MAX_FRAME_DELTA = 0.25;

const EPSILON = 1e-9;

export function createSpringState(value: number, velocity = 0): AccumulatingSpringState {
  'worklet';
  return { value, velocity, accumulator: 0 };
}

function substep(state: SpringState, target: number, params: SpringParams, dt: number): SpringState {
  'worklet';
  const acceleration =
    (-params.stiffness * (state.value - target) - params.damping * state.velocity) / params.mass;
  const velocity = state.velocity + acceleration * dt;
  const value = state.value + velocity * dt;
  return { value, velocity };
}

/**
 * Advances a spring by `frameDeltaSeconds` of real time, internally stepping in
 * fixed 1/120 s substeps accumulated against that delta. This is what makes the
 * result frame-rate independent: the physics only ever sees 1/120 s steps,
 * regardless of how often the caller invokes this function.
 */
export function integrateSpring(
  state: AccumulatingSpringState,
  target: number,
  params: SpringParams,
  frameDeltaSeconds: number
): AccumulatingSpringState {
  'worklet';
  let { value, velocity, accumulator } = state;
  // A non-finite delta (NaN from a failed timestamp subtraction, Infinity from
  // a bad clock) would poison the accumulator permanently: NaN survives both
  // Math.min and the substep loop condition, so the spring would never step
  // again and every channel would read NaN forever. Refuse the frame instead.
  if (!Number.isFinite(frameDeltaSeconds)) {
    return state;
  }
  // Clamped low as well as high, matching OrbicSpring.advance(by:) in
  // Sources/Orbic/Spring.swift — a negative delta must not rewind the
  // accumulator on one platform and be floored to zero on the other.
  accumulator += Math.min(Math.max(frameDeltaSeconds, 0), MAX_FRAME_DELTA);

  while (accumulator + EPSILON >= FIXED_SUBSTEP) {
    ({ value, velocity } = substep({ value, velocity }, target, params, FIXED_SUBSTEP));
    accumulator -= FIXED_SUBSTEP;
  }

  return { value, velocity, accumulator };
}
