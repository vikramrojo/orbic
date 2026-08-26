import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * True while the app is foregrounded.
 *
 * A backgrounded Orb must stop advancing its clock without unmounting — the
 * native counterpart of the web bundle's hidden-tab pausing. Returning to the
 * foreground resumes from the current values rather than replaying the gap,
 * because the runtime drops its stale timestamp on reactivation.
 */
export function useIsAppActive(): boolean {
  const [isActive, setIsActive] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setIsActive(next === 'active');
    });
    return () => subscription.remove();
  }, []);

  return isActive;
}
