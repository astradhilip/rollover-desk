#!/usr/bin/env node
// Stop: typecheck and test packages changed since HEAD, so a turn cannot end on a broken build.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}
// One retry only: a second block on the same stop would loop.
if (input.stop_hook_active) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const turbo = path.join(root, 'node_modules/.bin/turbo');
if (!existsSync(turbo)) process.exit(0);

const changed = spawnSync('git', ['status', '--porcelain', '--', 'apps', 'packages'], {
  cwd: root,
  encoding: 'utf8',
});
if (!changed.stdout?.trim()) process.exit(0);

const r = spawnSync(turbo, ['run', 'typecheck', 'test', '--filter=[HEAD]', '--output-logs=errors-only'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 240_000,
});
if (r.error?.code === 'ETIMEDOUT') {
  process.stderr.write('Typecheck and tests timed out after 4 minutes; their result is unknown.\n');
  process.exit(2);
}
if (r.status !== 0) {
  process.stderr.write(
    `Typecheck or tests failed for changed packages:\n${`${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-4000)}\n`,
  );
  process.exit(2);
}
