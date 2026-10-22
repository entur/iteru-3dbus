import { defineConfig } from 'vite';

const ENTRIES = { index: 'index', core: 'core', limits: 'limits', netex: 'netex', faces: 'vector' };  // package entry: its src file

// Library build: one ES module per entry, shared code in chunks, three, ajv and fast-xml-parser left to the host.
export default defineConfig({
  build: {
    outDir: 'dist-lib',
    lib: { entry: Object.fromEntries(Object.entries(ENTRIES).map(([n, f]) => [n, `src/${f}.js`])), formats: ['es'] },
    rollupOptions: { external: [/^three(\/|$)/, /^ajv(\/|$)/, /^fast-xml-parser(\/|$)/] },
  },
});
