import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { check, shellText } from './guard.mjs';
import { entry } from './log-prompt.mjs';
import { findTerm, redact } from './lib.mjs';

// Built by concatenation so that this file does not itself hold a credential shape.
const TOKEN = 'github_pat_' + 'A1b2C3d4'.repeat(4);
const TERMS = ['zzreference', 'zz other'];
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const write = (file_path, content) => ({ tool_name: 'Write', tool_input: { file_path, content } });

test('blocks a planted credential in a command and in a file', () => {
  assert.match(check(bash(`curl -H "Authorization: Bearer ${TOKEN}" x`)), /credential/);
  assert.match(check(write('a.ts', `const t = '${TOKEN}';`)), /credential/);
});

test('blocks a credential embedded in a remote URL', () => {
  const url = 'https://me:secret' + '@github.com/me/r.git';
  assert.match(check(bash(`git remote set-url origin ${url}`)), /credential/);
});

test('blocks a planted forbidden term in file content and in a commit message', () => {
  assert.match(check(write('a.md', 'see ZZReference for details'), TERMS), /forbidden-term/);
  assert.match(check(bash('git commit -m "port from zzreference"'), TERMS), /forbidden-term/);
});

test('matches whole words only', () => {
  assert.equal(findTerm('a zzreferences word', TERMS), null);
  assert.equal(findTerm('zz other', TERMS), 'zz other');
  assert.equal(check(write('a.md', 'zzreferenced'), TERMS), null);
});

test('allows a term in vendored skills and in the term list itself', () => {
  assert.equal(check(write('.claude/skills/impeccable/x.md', 'zzreference'), TERMS), null);
  assert.equal(check(write('.claude/forbidden-terms.local', 'zzreference'), TERMS), null);
});

test('blocks risky git and secret operations', () => {
  assert.match(check(bash('git push origin main')), /main/);
  assert.match(check(bash('git push --force origin feature/x')), /Force-push/);
  assert.match(check(bash('git push -f')), /Force-push/);
  assert.match(check(bash('git add -A')), /stage files/);
  assert.match(check(bash('git add .')), /stage files/);
  assert.match(check(bash('cat ~/.git-credentials')), /off limits/);
  assert.match(check(bash('git credential fill')), /github-pr/);
  assert.match(check(bash('echo x > .env')), /\.env/);
  assert.match(check(write('apps/api/.env.local', 'x')), /\.env/);
});

test('allows ordinary work', () => {
  assert.equal(check(bash('git push -u origin feature/m0-repo-harness')), null);
  assert.equal(check(bash('git add README.md docs/main.md')), null);
  assert.equal(check(write('.env.example', 'JWT_SECRET=')), null);
  assert.equal(check(bash('pnpm test'), TERMS), null);
});

test('a term in a read-only command path is allowed, because reference material must stay readable', () => {
  assert.equal(check(bash('ls /somewhere/zzreference/design'), TERMS), null);
});

test('quoted heredoc bodies are data, not commands', () => {
  assert.equal(shellText("cat <<'EOF'\ngit push origin main\nEOF\necho ok").includes('git push'), false);
  assert.equal(check(bash("cat > doc.md <<'EOF'\ngit add -A\nEOF")), null);
});

test('redact removes credentials and terms, and the log entry is safe', () => {
  assert.equal(redact(`x ${TOKEN} zzreference y`, TERMS), 'x [redacted-token] [redacted] y');
  const e = entry(`look at /home/zzreference ${TOKEN}`, TERMS, new Date('2026-01-02T03:04:05Z'));
  assert.ok(e.includes('2026-01-02T03:04:05.000Z'));
  assert.ok(!e.includes('zzreference') && !e.includes(TOKEN));
});

test('process contract: exit 2 with a reason when blocked, exit 0 otherwise', () => {
  const guard = fileURLToPath(new URL('./guard.mjs', import.meta.url));
  const run = (input) =>
    spawnSync(process.execPath, [guard], { input: JSON.stringify(input), encoding: 'utf8' });
  const blocked = run(bash('git add -A'));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /stage files/);
  assert.equal(run(bash('git status')).status, 0);
  assert.equal(spawnSync(process.execPath, [guard], { input: 'not json' }).status, 0);
});

test('review regressions: implicit pushes to main are blocked only on main', () => {
  for (const cmd of ['git push', 'git push origin', 'git push origin HEAD', 'git push origin HEAD:main']) {
    assert.match(check(bash(cmd), [], { branch: 'main' }), /main/, cmd);
  }
  assert.equal(check(bash('git push'), [], { branch: 'feature/x' }), null);
  assert.equal(check(bash('git push origin HEAD'), [], { branch: 'feature/x' }), null);
  assert.equal(check(bash('git push -u origin feature/m2-main-layout')), null);
  assert.match(check(bash('git push origin feature/x:main')), /main/);
  assert.match(check(bash('git push --all')), /main/);
});

test('review regressions: flag and spelling variants are blocked', () => {
  for (const cmd of [
    'git push origin +feature/x',
    'git push -uf origin x',
    'git -C . push --force',
    'git push --force-with-lease',
  ]) {
    assert.match(check(bash(cmd)), /Force-push/, cmd);
  }
  for (const cmd of [
    'git -C . add -A',
    'git add README.md .',
    'git add ./',
    'git add -- .',
    'git add -u',
    'cd x && git add .',
  ]) {
    assert.match(check(bash(cmd)), /stage files/, cmd);
  }
  assert.match(check(bash('git commit -am x')), /stage files/);
  assert.equal(check(bash('git commit -m x')), null);
  assert.equal(check(bash('git commit --amend -m x')), null);
});

test('review regressions: MultiEdit content is scanned', () => {
  const multi = (s) => ({
    tool_name: 'MultiEdit',
    tool_input: { file_path: 'a.ts', edits: [{ new_string: s }] },
  });
  assert.match(check(multi(TOKEN)), /credential/);
  assert.match(check(multi('zzreference'), TERMS), /forbidden-term/);
});

test('review regressions: .env writes by other commands, and credential reads', () => {
  for (const cmd of ['tee .env', 'cp a .env', '(echo x > .env)', 'mv a .env.local']) {
    assert.match(check(bash(cmd)), /\.env/, cmd);
  }
  assert.equal(check(bash('cp .env.example elsewhere')), null);
  assert.equal(check(bash('cat .env.example > copy.txt')), null);
  const read = (file_path) => ({ tool_name: 'Read', tool_input: { file_path } });
  assert.match(check(read('/home/me/.git-credentials')), /off limits/);
  assert.match(check(read('/x/.env.production')), /secrets/);
  assert.equal(check(read('/x/.env.example')), null);
  assert.equal(check(read('/x/readme.md')), null);
});

test('review regressions: terms match common renderings, not ordinary words', () => {
  for (const s of [
    'zzreference_notes',
    'zzreference-notes',
    'zzreferenceDesign',
    'myZzreference',
    'ZZREFERENCE',
    'zz_other',
    'zz-other',
    'zz\nother',
  ]) {
    assert.ok(findTerm(s, TERMS), s);
  }
  for (const s of ['zzreferences', 'azzreference', 'zzreferenced']) {
    assert.equal(findTerm(s, TERMS), null, s);
  }
});

test('review regressions: the guard still runs through a symlinked path', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'guard-'));
  const hooks = fileURLToPath(new URL('.', import.meta.url));
  symlinkSync(hooks, path.join(dir, 'hooks'));
  const r = spawnSync(process.execPath, [path.join(dir, 'hooks/guard.mjs')], {
    input: JSON.stringify(bash('git add -A')),
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 2);
});
