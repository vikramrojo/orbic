type Ticker = (nowMs: number) => void;

const tickers = new Set<Ticker>();
let rafId: number | null = null;
let hiddenListenerAttached = false;

function loop(now: number): void {
  rafId = null;
  if (tickers.size === 0) return;
  for (const tick of tickers) tick(now);
  schedule();
}

function schedule(): void {
  if (rafId !== null) return;
  if (tickers.size === 0) return;
  if (typeof document !== 'undefined' && document.hidden) return; // hidden-tab pause
  if (typeof requestAnimationFrame === 'undefined') return; // SSR guard
  rafId = requestAnimationFrame(loop);
}

function attachHiddenListener(): void {
  if (hiddenListenerAttached || typeof document === 'undefined') return;
  hiddenListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });
}

/**
 * One shared `requestAnimationFrame` loop for every active `<Orb>` instance
 * process-wide (mirrors the one-shared-WebGL2-context design: many
 * instances, one driver). The loop stops entirely — no frames scheduled —
 * whenever there are no active tickers or the document is hidden, and
 * restarts on the next registration or on `visibilitychange`.
 *
 * Each ticker receives the raw rAF timestamp; callers compute their own
 * `dt` from their own last-seen timestamp (see `OrbRuntime.tick`), so
 * instances joining or leaving at different times never interfere with
 * each other's delta.
 */
export function registerTicker(fn: Ticker): () => void {
  attachHiddenListener();
  tickers.add(fn);
  schedule();
  return () => {
    tickers.delete(fn);
  };
}

/** Test/debug hook: how many tickers are currently registered. */
export function activeTickerCount(): number {
  return tickers.size;
}
