import { readFileSync } from 'node:fs';
import { fromNetex } from './netex.js';
import { validate } from './validate.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run validate -- <bus.xml | bus.json>...');
  process.exit(2);
}

/** A file's errors and warnings: NeTEx XML through fromNetex, anything else as a render input JSON. */
const check = (f) => {
  const text = readFileSync(f, 'utf8');
  if (!f.endsWith('.xml')) return { errs: validate(JSON.parse(text)), warns: [] };
  const r = fromNetex(text);
  return r.ok ? { errs: [], warns: r.warns } : { errs: r.errs, warns: [] };
};

const bad = files
  .map((f) => [f, check(f)])
  .map(([f, { errs, warns }]) => {
    console.log([errs.length ? `FAIL ${f}` : `ok   ${f}`, ...errs.map((e) => `  ${e}`), ...warns.map((w) => `  warn ${w}`)].join('\n'));
    return errs.length;
  })
  .filter(Boolean);

process.exit(bad.length ? 1 : 0);
