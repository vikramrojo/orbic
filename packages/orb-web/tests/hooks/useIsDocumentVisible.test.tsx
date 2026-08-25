// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useIsDocumentVisible } from '../../src/hooks/useIsDocumentVisible';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useIsDocumentVisible', () => {
  afterEach(() => {
    setHidden(false);
  });

  it('starts visible when the document is not hidden', () => {
    const { result } = renderHook(() => useIsDocumentVisible());
    expect(result.current).toBe(true);
  });

  it('flips to false on a hidden-tab visibilitychange, and back on visible', () => {
    const { result } = renderHook(() => useIsDocumentVisible());

    act(() => setHidden(true));
    expect(result.current).toBe(false);

    act(() => setHidden(false));
    expect(result.current).toBe(true);
  });
});
