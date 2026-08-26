import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => resolve(here, `packages/${name}/src/index.ts`);

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    /**
     * Resolve workspace packages to their SOURCE, not their built `dist`.
     *
     * Without this the suite tests whatever was last built rather than what is
     * on disk, which is not a theoretical risk: adding three fields regenerated
     * `src/generated` while `dist` kept the previous list, so a test comparing
     * the two saw a mismatch that existed only in the build output. The same
     * staleness had already reached the browser once as a flat fallback disc —
     * see examples/web/vite.config.ts, which aliases for the same reason.
     */
    alias: {
      '@orbic/core': pkg('orb-core'),
      '@orbic/web': pkg('orb-web'),
    },
  },
});
