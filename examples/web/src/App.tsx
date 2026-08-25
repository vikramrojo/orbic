import { useState } from 'react';
import { Orb, Surface } from '@orbic/web';
import { PRESET_NAMES } from '@orbic/core';
import type { PresetName } from '@orbic/core';

// flat-color is the pipeline-proof placeholder, not a field worth judging
// aesthetically — the switcher below only offers the three real ported
// fields (task group 6).
const REVIEW_FIELDS = ['chladni', 'silk', 'veils'] as const;

const BODY_TEXT =
  'Orbic separates the material from the shape from the personality: swap the field and every surface in a product reskins together, without anyone touching a compositor or a spring curve by hand.';

// Selected vs. unselected reads through largen's tone/variant axes rather
// than a hand-rolled active/inactive style object — soft+primary for the
// current choice, ghost+neutral for the rest, both at data-size="sm" so the
// chrome stays quiet next to the orb.
function optionProps(active: boolean) {
  return active
    ? { 'data-tone': 'primary', 'data-variant': 'soft', 'data-size': 'sm' }
    : { 'data-tone': 'neutral', 'data-variant': 'ghost', 'data-size': 'sm' };
}

export function App() {
  // Shared across <Orb> and every <Surface> below — the point of this
  // screen is confirming a field swap changes both shapes together (the
  // "same material" claim), so one control drives all of them.
  const [field, setField] = useState<(typeof REVIEW_FIELDS)[number]>('chladni');
  const [state, setState] = useState<PresetName>('subtle');

  return (
    <div className="orbic-page">
      <header className="orbic-header">
        <h1 className="orbic-title">Orbic — web review harness</h1>
        <p className="orbic-subhead">
          field: <code>{field}</code> · state: <code>{state}</code>
        </p>
      </header>

      <section className="orbic-section">
        <h2 className="orbic-heading">Field (shared by every Orb and Surface below)</h2>
        <div className="orbic-row">
          {REVIEW_FIELDS.map((f) => (
            <button key={f} onClick={() => setField(f)} {...optionProps(f === field)}>
              {f}
            </button>
          ))}
        </div>
      </section>

      <section className="orbic-section">
        <h2 className="orbic-heading">Orb — presets and transitions</h2>
        <p className="orbic-hint">
          Click a preset to feel the transition. <code>subtle→active</code> should snap awake;{' '}
          <code>active→subtle</code> should sigh out.
        </p>
        <div className="orbic-orb-row">
          <Orb field={field} state={state} size={160} />
        </div>
        <div className="orbic-row">
          {PRESET_NAMES.map((p) => (
            <button key={p} onClick={() => setState(p)} {...optionProps(p === state)}>
              {p}
            </button>
          ))}
        </div>
      </section>

      <section className="orbic-section">
        <h2 className="orbic-heading">Orb and Surface together, same field</h2>
        <p className="orbic-hint">Brand unity, judged directly: do these read as the same material?</p>
        <div className="orbic-unity-row">
          <div className="orbic-card" style={{ width: 360, height: 200 }}>
            <Surface field={field} preset={state} />
            <div className="orbic-card-overlay">
              <Orb field={field} state={state} size={72} />
            </div>
          </div>
        </div>
      </section>

      <section className="orbic-section">
        <h2 className="orbic-heading">Surface — legibility under real body text</h2>
        <p className="orbic-hint">Judged honestly: real prose at a small size, not lorem ipsum at 24px.</p>
        <div className="orbic-card" style={{ width: '100%', maxWidth: 640, height: 260 }}>
          <Surface field={field} preset={state} />
          <div className="orbic-card-text">
            <p className="orbic-body-text">{BODY_TEXT}</p>
          </div>
        </div>
      </section>

      <section className="orbic-section">
        <h2 className="orbic-heading">Surface — aspect ratios (world-space behaviour)</h2>
        <p className="orbic-hint">
          Both should show the same material at the same feature size — the wide one reveals more of the field
          horizontally, per the <code>min(resolution.x, resolution.y)</code> world-space convention.
        </p>
        <div className="orbic-aspect-row">
          <div>
            <p className="orbic-caption">400 × 180</p>
            <div className="orbic-card" style={{ width: 400, height: 180 }}>
              <Surface field={field} preset={state} />
            </div>
          </div>
          <div>
            <p className="orbic-caption">180 × 400</p>
            <div className="orbic-card" style={{ width: 180, height: 400 }}>
              <Surface field={field} preset={state} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
