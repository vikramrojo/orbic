import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getInitial(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/** Tracks `prefers-reduced-motion`, SSR-safe (defaults to false when no `window`). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getInitial);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(QUERY);
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    setReduced(mediaQuery.matches);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}
