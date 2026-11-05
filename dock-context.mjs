import { readFileSync } from 'node:fs';
const p = 'C:/Users/24999/AppData/Local/Programs/@openchamberelectron/resources/web-dist/assets/useAppFontEffects-DpDiWkkc.js';
const s = readFileSync(p, 'utf8');
let i = -1, n = 0;
while ((i = s.indexOf('entryDock', i + 1)) !== -1 && n < 8) {
  n++;
  console.log('--- occurrence', n, 'at', i);
  console.log(s.slice(Math.max(0, i - 500), i + 700));
}
