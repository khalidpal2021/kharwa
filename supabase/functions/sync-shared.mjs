// Copies the shared notification block (supabase/functions/_shared/notify.ts)
// into each function, between its "// >>> shared: notify" and
// "// <<< shared: notify" lines, so every function stays one pasteable file
// while saying exactly the same things.
//
//   node supabase/functions/sync-shared.mjs          update the copies
//   node supabase/functions/sync-shared.mjs --check  fail if any has drifted

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const START = '// >>> shared: notify';
const END = '// <<< shared: notify';
const FUNCTIONS = ['send-reminders', 'send-nudge', 'send-message'];

const block = (text, where) => {
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${where}: no shared notify block`);
  return [a, b + END.length];
};

const source = readFileSync(join(here, '_shared', 'notify.ts'), 'utf8').replace(/\r\n/g, '\n');
const [sa, sb] = block(source, '_shared/notify.ts');
const shared = source.slice(sa, sb);

const check = process.argv.includes('--check');
let drifted = 0;
for (const fn of FUNCTIONS) {
  const file = join(here, fn, 'index.ts');
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const [a, b] = block(text, `${fn}/index.ts`);
  if (text.slice(a, b) === shared) { console.log(`${fn}: in step`); continue; }
  drifted += 1;
  if (check) { console.log(`${fn}: DRIFTED from _shared/notify.ts`); continue; }
  writeFileSync(file, text.slice(0, a) + shared + text.slice(b));
  console.log(`${fn}: updated`);
}
if (check && drifted) process.exit(1);
