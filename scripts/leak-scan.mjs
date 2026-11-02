#!/usr/bin/env node
// Fails when tracked files, or with --history every commit, hold a credential or a forbidden term.
// Findings print a location only, never the matched text. Vendored skills are unmodified third-party
// files, checked for credentials but not for terms: icon and palette data contain unrelated matches.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findTerm, hasToken, isMain, loadTerms } from '../.claude/hooks/lib.mjs';

const VENDORED = /^\.claude\/skills\/(impeccable|ui-ux-pro-max|frontend-design)\//;
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });

export function scanText(label, text, terms, { skipTerms = false } = {}) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    if (hasToken(line)) found.push(`${label}:${i + 1} credential`);
    if (!skipTerms && findTerm(line, terms)) found.push(`${label}:${i + 1} forbidden term`);
  });
  // A multi-word term can be split across a line break.
  if (!skipTerms && !found.some((f) => f.endsWith('forbidden term')) && findTerm(text, terms)) {
    found.push(`${label} forbidden term across lines`);
  }
  return found;
}

const VENDORED_DIRS = ['impeccable', 'ui-ux-pro-max', 'frontend-design'].map((d) => `.claude/skills/${d}`);

export function scanHistory(root, terms) {
  const found = [];
  const commits = git(['rev-list', '--all'], root).split('\n').filter(Boolean);
  for (const sha of commits) {
    const short = sha.slice(0, 8);
    found.push(
      ...scanText(`${short} message+author`, git(['show', '-s', '--format=%an %ae%n%B', sha], root), terms),
    );
    const own = git(
      ['show', '--format=', '--unified=0', sha, '--', '.', ...VENDORED_DIRS.map((d) => `:(exclude)${d}`)],
      root,
    );
    found.push(...scanText(`${short} diff`, own, terms));
    const vendored = git(['show', '--format=', '--unified=0', sha, '--', ...VENDORED_DIRS], root);
    found.push(...scanText(`${short} vendored diff`, vendored, terms, { skipTerms: true }));
    const names = git(
      [
        'show',
        '--format=',
        '--name-only',
        '-z',
        sha,
        '--',
        '.',
        ...VENDORED_DIRS.map((d) => `:(exclude)${d}`),
      ],
      root,
    );
    found.push(...scanText(`${short} file name`, names.replaceAll('\0', '\n'), terms));
  }
  return found;
}

export function scanTracked(root, terms) {
  const found = [];
  // -z keeps non-ASCII paths literal; without it they arrive quoted and would be skipped.
  for (const file of git(['ls-files', '-z'], root).split('\0').filter(Boolean)) {
    const skipTerms = VENDORED.test(file);
    if (!skipTerms && findTerm(file, terms)) found.push(`${file} forbidden term in file name`);
    const full = path.join(root, file);
    if (!existsSync(full) || file === 'pnpm-lock.yaml') continue;
    const buf = readFileSync(full);
    if (buf.includes(0)) continue;
    found.push(...scanText(file, buf.toString('utf8'), terms, { skipTerms }));
  }
  return found;
}

if (isMain(import.meta.url)) {
  const root = process.cwd();
  const terms = loadTerms(root);
  if (!terms) console.log('No local term list: scanning for credentials only.');
  const found = [...scanTracked(root, terms ?? [])];
  if (process.argv.includes('--history')) found.push(...scanHistory(root, terms ?? []));
  if (found.length) {
    console.error(`Leak scan failed:\n${found.join('\n')}`);
    process.exit(1);
  }
  console.log('Leak scan clean.');
}
