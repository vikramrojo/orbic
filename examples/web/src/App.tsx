import { useState } from 'react';
import { Orb, Surface } from '@orbic/web';
import { PRESET_NAMES } from '@orbic/core';
import type { PresetName } from '@orbic/core';

// flat-color is the pipeline-proof placeholder, not a field worth judging
// aesthetically — every switcher below only offers the three real ported
// fields (task group 6).
const REVIEW_FIELDS = ['chladni', 'silk', 'veils'] as const;
type Field = (typeof REVIEW_FIELDS)[number];

const BODY_TEXT =
  'Orbic separates the material from the shape from the personality: swap the field and every surface in a product reskins together, without anyone touching a compositor or a spring curve by hand.';

type Platform = 'react' | 'swiftui' | 'react-native';

const PLATFORMS: Platform[] = ['react', 'swiftui', 'react-native'];

const PLATFORM_LABELS: Record<Platform, string> = {
  react: 'React',
  swiftui: 'SwiftUI',
  'react-native': 'React Native',
};

// The prop surface (field, state, size, speed, paused, edge) is identical on
// all three platforms by spec, so only the import line and call syntax change.
const INSTALL_SNIPPETS: Record<Platform, string> = {
  react: 'npm install @orbic/web',
  swiftui: '// Package.swift\n.package(path: "../Orbic")',
  'react-native': 'npm install @orbic/native',
};

const USAGE_SNIPPETS: Record<Platform, string> = {
  react: "import { Orb } from '@orbic/web';\n\n<Orb field=\"chladni\" state=\"active\" />",
  swiftui: 'import Orbic\n\nOrb(field: "chladni", state: "active")',
  'react-native':
    "import { Orb } from '@orbic/native';\n\n<Orb field=\"chladni\" state=\"active\" />",
};

interface GalleryItem {
  field: Field;
  state: PresetName;
  height: number;
  orbSize: number;
}

// Deliberately varied heights and orb sizes — that variety is most of what
// reads as a gallery rather than a grid, per the reference layout.
const GALLERY_ITEMS: GalleryItem[] = [
  { field: 'chladni', state: 'active', height: 260, orbSize: 44 },
  { field: 'silk', state: 'subtle', height: 130, orbSize: 28 },
  { field: 'veils', state: 'cooling', height: 190, orbSize: 34 },
  { field: 'chladni', state: 'warming', height: 130, orbSize: 28 },
  { field: 'silk', state: 'pacing', height: 280, orbSize: 44 },
  { field: 'veils', state: 'active', height: 150, orbSize: 30 },
  { field: 'chladni', state: 'cooling', height: 220, orbSize: 38 },
  { field: 'silk', state: 'warming', height: 140, orbSize: 28 },
];

const SIZE_OPTIONS = [64, 96, 128, 160] as const;

// Selected vs. unselected reads through largen's tone/variant axes rather
// than a hand-rolled active/inactive style object — soft+primary for the
// current choice, ghost+neutral for the rest, both at data-size="sm" so the
// chrome stays quiet. Reused for every chip-style control on the page:
// field, state, size, and the installation platform tabs.
function optionProps(active: boolean) {
  return active
    ? { 'data-tone': 'primary', 'data-variant': 'soft', 'data-size': 'sm' }
    : { 'data-tone': 'neutral', 'data-variant': 'ghost', 'data-size': 'sm' };
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.5 15l-5-5 5-5" />
    </svg>
  );
}

function IconGithub() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4l16 16M20 4L4 20" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M4.5 12.5h-1a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5l3.5 3.5L16 5.5" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M6 4.2v11.6a.9.9 0 0 0 1.37.77l9.3-5.8a.9.9 0 0 0 0-1.54l-9.3-5.8A.9.9 0 0 0 6 4.2z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <rect x="5" y="4" width="3.5" height="12" rx="1" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function CodeBlock({ id, code, copiedId, onCopy }: { id: string; code: string; copiedId: string | null; onCopy: (id: string, code: string) => void }) {
  return (
    <div className="orbic-codeblock">
      <pre>{code}</pre>
      <button
        type="button"
        className="orbic-copy-btn"
        data-variant="ghost"
        data-tone="neutral"
        aria-label="Copy to clipboard"
        onClick={() => onCopy(id, code)}
      >
        {copiedId === id ? <IconCheck /> : <IconCopy />}
      </button>
    </div>
  );
}

export function App() {
  // Shared across <Orb> and every <Surface> in the diagnostics block below —
  // the point of that block is confirming a field swap changes both shapes
  // together (the "same material" claim), so one control drives all of them.
  const [field, setField] = useState<Field>('chladni');
  const [state, setState] = useState<PresetName>('subtle');

  const [platform, setPlatform] = useState<Platform>('react');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    });
  };

  // The playground exercises the full prop surface — including `edge`, the
  // one thing worth being able to see — independently of the diagnostics
  // block above, and drives the single big orb in the preview panel below.
  const [pgField, setPgField] = useState<Field>('silk');
  const [pgState, setPgState] = useState<PresetName>('active');
  const [pgSize, setPgSize] = useState<number>(96);
  const [pgSpeed, setPgSpeed] = useState(1);
  const [pgEdge, setPgEdge] = useState(0);
  const [pgBacklight, setPgBacklight] = useState(0);
  const [pgPaused, setPgPaused] = useState(false);

  return (
    <div className="orbic-page">
      <div className="orbic-shell">
        <div className="orbic-topbar">
          {/* No real Orbic domain or repo exists yet to link to — this harness
              renders the chrome without inventing a destination for it. */}
          <span className="orbic-navlink">
            <IconChevronLeft />
            orbic web review harness
          </span>
          <div className="orbic-icon-cluster">
            <button type="button" className="orbic-icon-btn" data-variant="ghost" data-tone="neutral" aria-label="GitHub" disabled>
              <IconGithub />
            </button>
            <button type="button" className="orbic-icon-btn" data-variant="ghost" data-tone="neutral" aria-label="X" disabled>
              <IconX />
            </button>
          </div>
        </div>

        <header className="orbic-header">
          <div className="orbic-tile">
            <Orb field="chladni" state="subtle" size={20} />
          </div>
          <h1 className="orbic-title">Orbic</h1>
          <p className="orbic-subhead">An animated orb component for React, SwiftUI, and React Native.</p>
        </header>

        <section className="orbic-section">
          <div className="orbic-gallery">
            {GALLERY_ITEMS.map((item, i) => (
              <div key={i} className="orbic-gallery-card" style={{ height: item.height }}>
                <div className="orbic-pill">
                  <Orb field={item.field} state={item.state} size={item.orbSize} />
                  <span className="orbic-pill-label">
                    {item.field} · {item.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="orbic-section">
          <h2 className="orbic-heading">Field &amp; state</h2>
          <p className="orbic-hint">Drives every panel below — confirming a reskin carries across shapes.</p>
          <div className="orbic-row">
            {REVIEW_FIELDS.map((f) => (
              <button key={f} onClick={() => setField(f)} {...optionProps(f === field)}>
                {f}
              </button>
            ))}
          </div>
          <div className="orbic-row" style={{ marginTop: 8 }}>
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

        <section className="orbic-section">
          <div className="orbic-section-row">
            <h2 className="orbic-heading">Installation</h2>
            <div className="orbic-tabs">
              {PLATFORMS.map((p) => (
                <button key={p} onClick={() => setPlatform(p)} {...optionProps(p === platform)}>
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <CodeBlock id="install" code={INSTALL_SNIPPETS[platform]} copiedId={copiedId} onCopy={copy} />
        </section>

        <section className="orbic-section">
          <h2 className="orbic-heading">Usage</h2>
          <CodeBlock id="usage" code={USAGE_SNIPPETS[platform]} copiedId={copiedId} onCopy={copy} />
        </section>

        <section className="orbic-section">
          <h2 className="orbic-heading">Playground</h2>
          <p className="orbic-hint">Every prop, live — including edge, the newest one.</p>
          <div className="orbic-panel">
            <div className="orbic-control-group">
              <span className="orbic-control-label">Field</span>
              <div className="orbic-row">
                {REVIEW_FIELDS.map((f) => (
                  <button key={f} onClick={() => setPgField(f)} {...optionProps(f === pgField)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="orbic-control-group">
              <span className="orbic-control-label">State</span>
              <div className="orbic-row">
                {PRESET_NAMES.map((p) => (
                  <button key={p} onClick={() => setPgState(p)} {...optionProps(p === pgState)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="orbic-control-group">
              <span className="orbic-control-label">Size</span>
              <div className="orbic-row">
                {SIZE_OPTIONS.map((s) => (
                  <button key={s} onClick={() => setPgSize(s)} {...optionProps(s === pgSize)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="orbic-control-group">
              <span className="orbic-control-label">Speed</span>
              <div className="orbic-slider-row">
                <input
                  type="range"
                  min={0.25}
                  max={2}
                  step={0.05}
                  value={pgSpeed}
                  onChange={(e) => setPgSpeed(Number(e.target.value))}
                />
                <span className="orbic-slider-value">{pgSpeed.toFixed(2)}×</span>
              </div>
            </div>

            <div className="orbic-control-group">
              <span className="orbic-control-label">Edge</span>
              <div className="orbic-slider-row">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={pgEdge}
                  onChange={(e) => setPgEdge(Number(e.target.value))}
                />
                <span className="orbic-slider-value">{pgEdge.toFixed(2)}</span>
              </div>
            </div>

            <div className="orbic-control-group">
              <span className="orbic-control-label">Backlight</span>
              <div className="orbic-slider-row">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={pgBacklight}
                  onChange={(e) => setPgBacklight(Number(e.target.value))}
                />
                <span className="orbic-slider-value">{pgBacklight.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="orbic-section">
          <h2 className="orbic-heading">Preview</h2>
          <div className="orbic-preview-card">
            <Orb
              field={pgField}
              state={pgState}
              size={pgSize}
              speed={pgSpeed}
              edge={pgEdge}
              backlight={pgBacklight}
              paused={pgPaused}
            />
          </div>
          <div className="orbic-preview-controls">
            <button
              type="button"
              className="orbic-play-btn"
              data-variant="ghost"
              data-tone="neutral"
              aria-label={pgPaused ? 'Play' : 'Pause'}
              onClick={() => setPgPaused((p) => !p)}
            >
              {pgPaused ? <IconPlay /> : <IconPause />}
            </button>
          </div>
        </section>

        <footer className="orbic-footer">Built on @orbic/web, @orbic/native, and the Orbic Swift package.</footer>
      </div>
    </div>
  );
}
