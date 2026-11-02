#!/usr/bin/env node
// PostToolUse: format the edited file and lint it. Lint errors go back to Claude (exit 2).
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!file || !existsSync(file) || !file.startsWith(root)) process.exit(0);
const rel = path.relative(root, file);
if (
  /(^|\/)(node_modules|dist|\.next|\.claude\/skills\/(impeccable|ui-ux-pro-max|frontend-design))\//.test(rel)
)
  process.exit(0);

const prettier = path.join(root, 'node_modules/.bin/prettier');
if (/\.(ts|tsx|js|mjs|cjs|json|css|md|ya?ml)$/.test(file) && existsSync(prettier)) {
  spawnSync(prettier, ['--write', '--log-level=warn', file], { cwd: root, stdio: 'ignore' });
}
if (/\.(ts|tsx)$/.test(file)) {
  let dir = path.dirname(file);
  while (dir.startsWith(root) && !existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  const eslint = path.join(dir, 'node_modules/.bin/eslint');
  if (existsSync(eslint)) {
    const r = spawnSync(eslint, ['--no-warn-ignored', file], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) {
      process.stderr.write(`ESLint failed for ${rel}:\n${r.stdout}${r.stderr}`);
      process.exit(2);
    }
  }
}
