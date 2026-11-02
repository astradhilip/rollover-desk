// Runs the design skill's detector over dashboard source. Any finding fails lint, so the gate stays at zero.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const r = spawnSync(
  process.execPath,
  [
    '.claude/skills/impeccable/scripts/detect.mjs',
    '--json',
    'apps/rollover-desk-dashboard/app',
    'apps/rollover-desk-dashboard/components',
    'packages/ui-web/src',
  ],
  { cwd: root, encoding: 'utf8' },
);
let findings;
try {
  findings = JSON.parse(r.stdout);
} catch {
  findings = null;
}
// No output or a crash means nothing was checked, which must not read as clean.
if (r.error || !Array.isArray(findings)) {
  console.error('The design detector did not run.', r.error ?? '', r.stderr);
  process.exit(1);
}
if (findings.length) {
  for (const f of findings)
    console.error(
      `${f.file}:${f.line ?? ''} ${f.antipattern ?? f.name ?? ''} ${f.description ?? f.snippet ?? ''}`,
    );
  process.exit(1);
}
console.log('Design detector clean.');
