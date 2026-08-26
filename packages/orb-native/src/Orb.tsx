import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { fallbackColorFromChannels, resolveFieldName, resolveStateName } from '@orbic/core';

import { runtimeEffect } from './runtime/effects.js';
import { useOrbUniforms } from './runtime/useOrbUniforms.js';
import { useIsAppActive } from './runtime/useIsAppActive.js';
import { usePrefersReducedMotion } from './runtime/usePrefersReducedMotion.js';

export interface OrbProps {
  field: string;
  state?: string;
  size?: number;
  speed?: number;
  paused?: boolean;
  /**
   * Silhouette firmness, 0..1. The orb compositor renders a soft radial
   * falloff with no hard edge; raising this firms it into a more defined
   * border. It does not restore the old masked sphere with its rim highlight.
   */
  edge?: number;
  /**
   * Rear lighting, 0..1. A light behind the sphere: it brightens the limb and
   * spills a little past the silhouette, tinted by the field's own colour.
   */
  backlight?: number;
}

/**
 * Animated Orb, rendered with Skia.
 *
 * The prop surface (`field`, `state`, `size`, `speed`, `paused`) matches web
 * and Swift, with the same defaults — the orb-component spec requires no
 * platform-only prop and no differing default.
 */
export function Orb({ field, state = 'subtle', size = 160, speed = 1, paused = false, edge = 0, backlight = 0 }: OrbProps) {
  const resolvedField = resolveFieldName(field, undefined, { component: '<Orb>', prop: 'field' });
  const resolvedState = resolveStateName(state, undefined, { component: '<Orb>', prop: 'state' });

  const reduceMotion = usePrefersReducedMotion();
  const appActive = useIsAppActive();

  // Reduced motion renders one static frame at resting values rather than
  // animating slowly; backgrounding stops the clock without unmounting
  // (platform-renderers and orb-component specs).
  const active = !paused && !reduceMotion && appActive;

  const uniforms = useOrbUniforms({ state: resolvedState, speed, active });
  const effect = useMemo(() => runtimeEffect(resolvedField, 'orb'), [resolvedField]);

  if (effect === null) {
    // Shader unavailable on this device: a solid colour derived from warmth
    // and energy, rather than a crash or a blank region.
    return (
      <View
        accessible={false}
        style={{
          width: size,
          height: size,
          // The orb compositor draws a soft falloff with no silhouette, so a
          // full-strength hard circle would misrepresent it. React Native has
          // no radial-gradient primitive without pulling in a dependency, and
          // this bundle's whole point is a minimal dependency floor — so the
          // circle stays but is dropped to partial opacity, which is closer to
          // the real thing than a crisp disc. An honest approximation, not a
          // match.
          borderRadius: size / 2,
          opacity: 0.55,
          backgroundColor: fallbackColorFromChannels(uniforms),
        }}
      />
    );
  }

  return (
    <Canvas style={{ width: size, height: size }} accessible={false}>
      <Fill>
        <Shader
          source={effect}
          uniforms={{
            // Frozen uniform ABI order (docs/shader-abi.md). Skia sizes the
            // drawing surface itself, so resolution is the logical size — DPR
            // is Skia's concern, not ours.
            u_resolution: [size, size],
            u_time: uniforms.t,
            u_energy: uniforms.energy,
            u_coherence: uniforms.coherence,
            u_warmth: uniforms.warmth,
            u_pulse: uniforms.pulse,
            // Trailing, orb-only — see epilogue-orb.sksl. Skia takes named
            // uniforms, so there is nothing positional to keep in sync.
            u_edge: edge,
            u_backlight: backlight,
          }}
        />
      </Fill>
    </Canvas>
  );
}
