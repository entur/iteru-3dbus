import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const RAW = '?raw';

/** Lets node load a `file?raw` import the way vite does: the file's text as the default export. */
registerHooks({
  load: (url, ctx, next) =>
    url.endsWith(RAW)
      ? { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(readFileSync(new URL(url.slice(0, -RAW.length)), 'utf8'))};` }
      : next(url, ctx),
});
