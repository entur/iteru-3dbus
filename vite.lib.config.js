import { defineConfig } from 'vite';

const ENTRIES = ['index', 'core', 'bus-2d', 'bus-3d'];

// Library build: one ES module per entry, shared code in chunks, three and ajv left to the host.
export default defineConfig({
  build: {
    outDir: 'dist-lib',
    lib: { entry: Object.fromEntries(ENTRIES.map((n) => [n, `src/${n}.js`])), formats: ['es'] },
    rollupOptions: { external: [/^three(\/|$)/, /^ajv(\/|$)/] },
  },
});
