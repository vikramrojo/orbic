import { useEffect, useState } from 'react';

/** Tracks `document.hidden`, for the hidden-tab-pause requirement (platform-renderers spec). SSR-safe. */
export function useIsDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  }, []);

  return visible;
}
