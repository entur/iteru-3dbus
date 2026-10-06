import { defineConfig } from 'vite';

// No inlining: the source link must point at a real .json file, not a data: URL.
export default defineConfig({ build: { assetsInlineLimit: 0 } });
