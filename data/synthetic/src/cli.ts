import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { answerKeyTotals, AS_OF, generateSamples, PROPERTY } from './index';

const out = fileURLToPath(new URL('../samples/', import.meta.url));
mkdirSync(out, { recursive: true });
const { key, files } = await generateSamples();
for (const file of files) writeFileSync(`${out}${file.filename}`, file.bytes);
const defects = Object.fromEntries(files.map((f) => [f.filename, f.defects]));
const answer = { asOf: AS_OF, property: PROPERTY, totals: answerKeyTotals(key), leases: key, defects };
writeFileSync(`${out}answer-key.json`, `${JSON.stringify(answer, null, 2)}\n`);
console.log(`Wrote ${files.length} rent rolls and the answer key to ${out}`);
