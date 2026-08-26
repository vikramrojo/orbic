/**
 * Optional-Reanimated detection.
 *
 * `react-native-reanimated` is an optional peer, required only by `<Orb>`
 * (platform-renderers spec). It is resolved lazily through `require` rather
 * than imported statically, because a static import would make the module a
 * hard dependency of the bundle: Metro resolves imports at build time, so a
 * Surface-only consumer without Reanimated installed would fail to bundle at
 * all rather than falling back.
 *
 * The result is computed once at module load. Whether Reanimated is installed
 * cannot change during a process's life, and React forbids conditionally
 * calling hooks — so the choice of animation path must be stable, not
 * re-evaluated per render.
 */

export interface ReanimatedModule {
  useSharedValue: <T>(initial: T) => { value: T };
  useFrameCallback: (
    callback: (frameInfo: { timeSincePreviousFrame: number | null; timestamp: number }) => void,
    autostart?: boolean
  ) => { setActive: (active: boolean) => void };
}

function load(): ReanimatedModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-reanimated') as Partial<ReanimatedModule> | undefined;
    if (!mod || typeof mod.useSharedValue !== 'function' || typeof mod.useFrameCallback !== 'function') {
      return null;
    }
    return mod as ReanimatedModule;
  } catch {
    return null;
  }
}

export const reanimated: ReanimatedModule | null = load();

/**
 * True when `<Orb>` can drive uniforms on the UI thread.
 *
 * When false, `<Orb>` still animates, via a JS-thread pump. That path is a
 * documented DEGRADATION, not a supported equivalent: a busy JS thread delays
 * the spring updates that make a mid-flight retarget feel responsive. See
 * `packages/orb-native/README.md`.
 */
export const hasReanimated = reanimated !== null;
