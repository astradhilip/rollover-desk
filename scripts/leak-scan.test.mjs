import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanHistory, scanTracked } from './leak-scan.mjs';

const TOKEN = 'ghp_' + 'abcDEF123'.repeat(5);
const TERMS = ['zzreference'];

function repo(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'leak-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 't');
  git('config', 'user.email', 't@example.com');
  try {
    fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('finds planted leaks in tracked files without printing them', () => {
  repo((dir, git) => {
    writeFileSync(path.join(dir, 'a.md'), `fine\nsee zzreference\n${TOKEN}\n`);
    git('add', 'a.md');
    const found = scanTracked(dir, TERMS);
    assert.deepEqual(found, ['a.md:2 forbidden term', 'a.md:3 credential']);
    assert.ok(!found.join().includes(TOKEN));
  });
});

test('finds a leak that a later commit deleted', () => {
  repo((dir, git) => {
    writeFileSync(path.join(dir, 'a.md'), 'zzreference\n');
    git('add', 'a.md');
    git('commit', '-qm', 'one');
    writeFileSync(path.join(dir, 'a.md'), 'clean\n');
    git('add', 'a.md');
    git('commit', '-qm', 'two');
    assert.deepEqual(scanTracked(dir, TERMS), []);
    assert.equal(scanHistory(dir, TERMS).filter((f) => f.includes('forbidden term')).length >= 1, true);
  });
});

test('finds a term in a commit message', () => {
  repo((dir, git) => {
    writeFileSync(path.join(dir, 'a.md'), 'clean\n');
    git('add', 'a.md');
    git('commit', '-qm', 'ported from zzreference');
    assert.ok(scanHistory(dir, TERMS).some((f) => f.includes('message')));
  });
});

test('vendored skills are checked for credentials but not for terms', () => {
  repo((dir, git) => {
    const skill = path.join(dir, '.claude/skills/impeccable');
    mkdirSync(skill, { recursive: true });
    writeFileSync(path.join(skill, 'x.md'), `zzreference\n${TOKEN}\n`);
    git('add', '.claude/skills/impeccable/x.md');
    assert.deepEqual(scanTracked(dir, TERMS), ['.claude/skills/impeccable/x.md:2 credential']);
  });
});

test('review regressions: non-ASCII paths are scanned', () => {
  repo((dir, git) => {
    writeFileSync(path.join(dir, 'caf\u00e9.md'), `${TOKEN}\n`);
    git('add', 'caf\u00e9.md');
    assert.deepEqual(scanTracked(dir, TERMS), ['caf\u00e9.md:1 credential']);
  });
});

test('review regressions: a credential deleted from a vendored skill is still found in history', () => {
  repo((dir, git) => {
    const skill = path.join(dir, '.claude/skills/impeccable');
    mkdirSync(skill, { recursive: true });
    writeFileSync(path.join(skill, 'x.md'), `${TOKEN}\n`);
    git('add', '.claude/skills/impeccable/x.md');
    git('commit', '-qm', 'one');
    writeFileSync(path.join(skill, 'x.md'), 'clean zzreference\n');
    git('add', '.claude/skills/impeccable/x.md');
    git('commit', '-qm', 'two');
    const found = scanHistory(dir, TERMS);
    assert.ok(found.some((f) => f.includes('vendored diff') && f.endsWith('credential')));
    assert.ok(!found.some((f) => f.includes('forbidden term')));
  });
});

test('review regressions: file names and multi-word terms split across lines are found', () => {
  repo((dir, git) => {
    writeFileSync(path.join(dir, 'zzreference-notes.md'), 'zz\nother\n');
    git('add', 'zzreference-notes.md');
    const found = scanTracked(dir, ['zzreference', 'zz other']);
    assert.ok(found.some((f) => f.includes('in file name')));
    assert.ok(found.some((f) => f.includes('across lines')));
  });
});
