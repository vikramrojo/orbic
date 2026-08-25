import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Orb, Surface } from '@orbic/web';
import { PRESET_NAMES } from '@orbic/core';
import type { PresetName } from '@orbic/core';

// flat-color is the pipeline-proof placeholder, not a field worth judging
// aesthetically — the switcher below only offers the three real ported
// fields (task group 6).
const REVIEW_FIELDS = ['chladni', 'silk', 'veils'] as const;

const BODY_TEXT =
  'Orbic separates the material from the shape from the personality: swap the field and every surface in a product reskins together, without anyone touching a compositor or a spring curve by hand.';

export function App() {
  // Shared across <Orb> and every <Surface> below — the point of this
  // screen is confirming a field swap changes both shapes together (the
  // "same material" claim), so one control drives all of them.
  const [field, setField] = useState<(typeof REVIEW_FIELDS)[number]>('chladni');
  const [state, setState] = useState<PresetName>('subtle');

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Orbic — web review harness</h1>
        <p style={styles.subhead}>
          field: <code>{field}</code> · state: <code>{state}</code>
        </p>
      </header>

      <section style={styles.section}>
        <h2 style={styles.h2}>Field (shared by every Orb and Surface below)</h2>
        <div style={styles.buttonRow}>
          {REVIEW_FIELDS.map((f) => (
            <button key={f} onClick={() => setField(f)} style={f === field ? styles.buttonActive : styles.button}>
              {f}
            </button>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Orb — presets and transitions</h2>
        <p style={styles.hint}>
          Click a preset to feel the transition. <code>subtle→active</code> should snap awake;{' '}
          <code>active→subtle</code> should sigh out.
        </p>
        <div style={styles.orbRow}>
          <Orb field={field} state={state} size={160} />
        </div>
        <div style={styles.buttonRow}>
          {PRESET_NAMES.map((p) => (
            <button key={p} onClick={() => setState(p)} style={p === state ? styles.buttonActive : styles.button}>
              {p}
            </button>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Orb and Surface together, same field</h2>
        <p style={styles.hint}>Brand unity, judged directly: do these read as the same material?</p>
        <div style={styles.unityRow}>
          <div style={{ ...styles.surfaceCard, width: 360, height: 200 }}>
            <Surface field={field} preset={state} />
            <div style={styles.surfaceOverlay}>
              <Orb field={field} state={state} size={72} />
            </div>
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Surface — legibility under real body text</h2>
        <p style={styles.hint}>Judged honestly: real prose at a small size, not lorem ipsum at 24px.</p>
        <div style={{ ...styles.surfaceCard, width: '100%', maxWidth: 640, height: 260 }}>
          <Surface field={field} preset={state} />
          <div style={styles.textOverlay}>
            <p style={styles.bodyText}>{BODY_TEXT}</p>
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Surface — aspect ratios (world-space behaviour)</h2>
        <p style={styles.hint}>
          Both should show the same material at the same feature size — the wide one reveals more of the field
          horizontally, per the <code>min(resolution.x, resolution.y)</code> world-space convention.
        </p>
        <div style={styles.aspectRow}>
          <div>
            <p style={styles.caption}>400 × 180</p>
            <div style={{ ...styles.surfaceCard, width: 400, height: 180 }}>
              <Surface field={field} preset={state} />
            </div>
          </div>
          <div>
            <p style={styles.caption}>180 × 400</p>
            <div style={{ ...styles.surfaceCard, width: 180, height: 400 }}>
              <Surface field={field} preset={state} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#0b0c10',
    color: '#e8e8ec',
    minHeight: '100vh',
    padding: '24px 32px 64px',
  },
  header: { marginBottom: 32 },
  h1: { fontSize: 20, fontWeight: 600, margin: '0 0 4px' },
  subhead: { fontSize: 13, color: '#9a9aa5', margin: 0 },
  section: { marginBottom: 48 },
  h2: { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: '#e8e8ec' },
  hint: { fontSize: 13, color: '#9a9aa5', margin: '0 0 16px' },
  buttonRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  button: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #2a2b33',
    background: '#15161c',
    color: '#e8e8ec',
    cursor: 'pointer',
    fontSize: 13,
  },
  buttonActive: {
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid #6a6dff',
    background: '#22224a',
    color: '#e8e8ec',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  orbRow: { display: 'flex', justifyContent: 'center', padding: '24px 0' },
  unityRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  surfaceCard: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #2a2b33',
  },
  surfaceOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    padding: 28,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 1.6,
    color: '#f4f4f7',
    margin: 0,
    maxWidth: '48ch',
  },
  aspectRow: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  caption: { fontSize: 12, color: '#9a9aa5', margin: '0 0 6px' },
};
