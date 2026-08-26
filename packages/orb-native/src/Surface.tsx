import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Canvas, Fill, Shader } from '@shopify/react-native-skia';
import { fallbackColorFromChannels, presetChannels, resolveFieldName, resolveStateName } from '@orbic/core';

import { runtimeEffect } from './runtime/effects.js';

export interface SurfaceProps {
  field: string;
  preset?: string;
  scale?: number;
  energy?: number;
  coherence?: number;
  warmth?: number;
  pulse?: number;
}

/** Matches the surface epilogue's own default. */
const DEFAULT_SURFACE_SCALE = 3.0;

/**
 * Static Surface, rendered with Skia.
 *
 * Exposes `field`, `preset` and `scale` plus per-channel overrides, and
 * deliberately no `state`, no spring configuration and no animation option
 * (surface-component spec).
 *
 * This file imports nothing from `./runtime/useOrbUniforms.js` and no
 * Reanimated API, which is what makes two guarantees structural rather than
 * merely intended: a Surface schedules no ongoing work, and it renders in a
 * project where Reanimated is not installed at all (task 8.4).
 */
export function Surface({
  field,
  preset = 'subtle',
  scale = DEFAULT_SURFACE_SCALE,
  energy,
  coherence,
  warmth,
  pulse,
}: SurfaceProps) {
  const resolvedField = resolveFieldName(field, undefined, { component: '<Surface>', prop: 'field' });
  const resolvedPreset = resolveStateName(preset, undefined, {
    component: '<Surface>',
    prop: 'preset',
  });

  const channels = useMemo(() => {
    const base = presetChannels(resolvedPreset);
    return {
      energy: energy ?? base.energy,
      coherence: coherence ?? base.coherence,
      warmth: warmth ?? base.warmth,
      pulse: pulse ?? base.pulse,
    };
  }, [resolvedPreset, energy, coherence, warmth, pulse]);

  // World space divides by min(width, height), so the shader needs the real
  // measured size to show the same feature size at any aspect ratio.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current?.width === width && current?.height === height ? current : { width, height }
    );
  };

  const effect = useMemo(() => runtimeEffect(resolvedField, 'surface'), [resolvedField]);

  // Decorative and behind content: it must never absorb taps.
  const container = { flex: 1 } as const;

  if (effect === null) {
    return (
      <View
        accessible={false}
        pointerEvents="none"
        onLayout={onLayout}
        style={[container, { backgroundColor: fallbackColorFromChannels(channels) }]}
      />
    );
  }

  return (
    <View accessible={false} pointerEvents="none" onLayout={onLayout} style={container}>
      {size !== null && (
        <Canvas style={container}>
          <Fill>
            <Shader
              source={effect}
              uniforms={{
                u_resolution: [size.width, size.height],
                // Pinned at zero: a Surface is static, so a given preset
                // always renders the same frame.
                u_time: 0,
                u_energy: channels.energy,
                u_coherence: channels.coherence,
                u_warmth: channels.warmth,
                u_pulse: channels.pulse,
                u_scale: scale,
              }}
            />
          </Fill>
        </Canvas>
      )}
    </View>
  );
}
