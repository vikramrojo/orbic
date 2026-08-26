import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the platform reduced-motion setting.
 *
 * The web bundle reads `prefers-reduced-motion` and the Swift bundle reads
 * `accessibilityReduceMotion`; this is the React Native equivalent. All three
 * feed the same decision: render one static frame at resting values rather
 * than animating more slowly (platform-renderers spec).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // The initial value is async, so a subscription alone would miss the
    // setting a user already had on before this mounted.
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
