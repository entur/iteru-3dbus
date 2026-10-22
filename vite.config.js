import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/** Copies index.html to 404.html after a build. */
const fallback = () => {
  let out;
  return {
    name: 'spa-404',
    apply: 'build',
    configResolved: (c) => (out = c.build.outDir),
    writeBundle: () => copyFileSync(join(out, 'index.html'), join(out, '404.html')),
  };
};

// No inlining: the source link must point at a real .json file, not a data: URL.
// GitHub Pages serves 404.html for /list and /bus, so a deep link boots the SPA.
export default defineConfig({ build: { assetsInlineLimit: 0 }, plugins: [fallback()] });
