import { readFileSync } from 'node:fs';
import { validate } from './validate.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: npm run validate -- <bus.json>...');
  process.exit(2);
}

const bad = files
  .map((f) => [f, validate(JSON.parse(readFileSync(f, 'utf8')))])
  .map(([f, errs]) => {
    console.log(errs.length ? `FAIL ${f}\n${errs.map((e) => `  ${e}`).join('\n')}` : `ok   ${f}`);
    return errs.length;
  })
  .filter(Boolean);

process.exit(bad.length ? 1 : 0);
