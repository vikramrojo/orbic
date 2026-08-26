import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => resolve(here, `../../packages/${name}/src/index.ts`);

export default defineConfig({
  plugins: [react()],
  resolve: {
    /**
     * Resolve the workspace packages to their SOURCE, not their built `dist`.
     *
     * Without this the harness consumes `dist`, which made it silently stale
     * every time a package changed: regenerating shaders updated
     * `src/generated`, `dist` kept the previous field list, and the app asked
     * the renderer for a field that no longer existed there. The renderer's
     * correct behaviour in that case — degrade to the flat fallback colour —
     * meant the failure showed up as a plain coloured disc rather than as an
     * error, which is a genuinely hard thing to diagnose from the page.
     *
     * Pointing at source also means editing a package hot-reloads here.
     */
    alias: {
      '@orbic/core': pkg('orb-core'),
      '@orbic/web': pkg('orb-web'),
    },
  },
});
