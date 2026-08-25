import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Tracks whether `ref`'s element is intersecting the viewport, for the
 * offscreen-pause requirement (platform-renderers spec). Defaults to
 * `true` so environments without `IntersectionObserver` (SSR, very old
 * browsers) fail open into animating rather than freezing forever.
 */
export function useIsIntersecting(ref: RefObject<Element | null>): boolean {
  const [intersecting, setIntersecting] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setIntersecting(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return intersecting;
}
