#!/usr/bin/env node
// PreToolUse guard. Exit 2 blocks the tool call and tells Claude why.
// A safety net against mistakes, not a security boundary: `docs/HARNESS.md` lists its limits.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findTerm, hasToken, isMain, loadTerms, projectRoot, TERMS_FILE } from './lib.mjs';

const isEnvFile = (p) => /^\.env(\..+)?$/.test(path.basename(p)) && path.basename(p) !== '.env.example';
const VENDORED = /(^|\/)\.claude\/skills\/(impeccable|ui-ux-pro-max|frontend-design)\//;
const ENV_TARGET = String.raw`[^;&|\n]*\.env(\.(?!example\b)[\w.-]+)?["')]?(\s|$|;|&|\||\))`;
const ENV_WRITE = new RegExp(String.raw`(^|[^<])>{1,2}\s*["']?${ENV_TARGET}|\b(tee|cp|mv)\b${ENV_TARGET}`);

/** The shell-interpreted text of a command: quoted heredoc bodies are data, not commands. */
export function shellText(cmd) {
  const out = [];
  let end = null;
  for (const line of cmd.split('\n')) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    const m = line.match(/<<-?\s*(['"])([\w.-]+)\1/);
    if (m) end = m[2];
    out.push(line);
  }
  return out.join('\n');
}

/** Each git invocation as { sub, args }, with global options such as `-C dir` removed. */
export function gitCalls(shell) {
  const calls = [];
  for (const segment of shell.split(/[;&|\n()]+/)) {
    const tokens = segment
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/^['"]|['"]$/g, ''));
    const at = tokens.indexOf('git');
    if (at === -1) continue;
    let i = at + 1;
    while (i < tokens.length && tokens[i].startsWith('-')) {
      i += /^(-C|-c|--git-dir|--work-tree|--namespace)$/.test(tokens[i]) ? 2 : 1;
    }
    if (tokens[i]) calls.push({ sub: tokens[i], args: tokens.slice(i + 1) });
  }
  return calls;
}

const hasShortFlag = (arg, flag) => /^-[a-zA-Z]+$/.test(arg) && arg.includes(flag);

function checkPush(args, branch) {
  if (args.some((a) => /^--force/.test(a) || a === '--mirror' || hasShortFlag(a, 'f') || a.startsWith('+')))
    return 'Force-push is blocked.';
  const positional = args.filter((a) => !a.startsWith('-'));
  const refspecs = positional.slice(1);
  const onlyNamesMain = (r) => /(^|:|\/)(main|master)$/.test(r);
  if (args.includes('--all') || refspecs.some(onlyNamesMain)) return 'Pushing to main is blocked; open a PR.';
  const implicit = refspecs.length === 0 || refspecs.some((r) => /^(HEAD|@)(:|$)/.test(r));
  if (implicit && (branch === 'main' || branch === 'master')) return 'Pushing to main is blocked; open a PR.';
  return null;
}

function checkGit({ sub, args }, branch) {
  if (sub === 'credential' && args[0] === 'fill')
    return 'Only scripts/github-pr.mjs may ask for the credential.';
  if (sub === 'push') return checkPush(args, branch);
  if (
    sub === 'add' &&
    args.some((a) => ['-A', '--all', '-u', '--update', '.', './', ':/'].includes(a) || hasShortFlag(a, 'A'))
  )
    return 'git add -A / . is blocked; stage files by name.';
  if (sub === 'commit' && args.some((a) => a === '--all' || hasShortFlag(a, 'a')))
    return 'git commit -a is blocked; stage files by name.';
  return null;
}

/** Returns a reason string when the call must be blocked, else null. */
export function check({ tool_name: tool, tool_input: input = {} }, terms = [], { branch } = {}) {
  if (tool === 'Read') {
    const p = String(input.file_path ?? '');
    if (path.basename(p) === '.git-credentials') return 'The git credential file is off limits.';
    return isEnvFile(p)
      ? `Reading ${path.basename(p)} is blocked: secrets stay out of the agent's hands.`
      : null;
  }
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = String(input.file_path ?? input.notebook_path ?? '');
    if (isEnvFile(p)) return `Writing ${path.basename(p)} is blocked: secrets stay out of the agent's hands.`;
    const edits = Array.isArray(input.edits) ? input.edits.map((e) => e?.new_string) : [];
    const text = [input.content, input.new_string, input.new_source, ...edits].filter(Boolean).join('\n');
    if (hasToken(text)) return 'This content contains a credential. Credentials never go in files.';
    if (!p.endsWith(TERMS_FILE) && !VENDORED.test(p) && isInProject(p)) {
      if (findTerm(`${p}\n${text}`, terms))
        return 'This content names something on the forbidden-term list. Rewrite it without the reference.';
    }
    return null;
  }
  if (tool !== 'Bash') return null;
  const cmd = String(input.command ?? '');
  if (hasToken(cmd)) return 'This command contains a credential. Use the git credential helper.';
  const shell = shellText(cmd);
  if (/\.git-credentials\b/.test(shell)) return 'The git credential file is off limits.';
  for (const call of gitCalls(shell)) {
    const reason = checkGit(call, branch);
    if (reason) return reason;
  }
  if (ENV_WRITE.test(shell)) return 'Writing to a .env file is blocked.';
  if (gitCalls(shell).some((c) => c.sub === 'commit') && findTerm(cmd, terms))
    return 'This commit message names something on the forbidden-term list.';
  return null;
}

function isInProject(p) {
  const root = projectRoot();
  return !path.isAbsolute(p) || p.startsWith(`${root}${path.sep}`);
}

if (isMain(import.meta.url)) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }
  const branch = spawnSync('git', ['branch', '--show-current'], {
    cwd: projectRoot(),
    encoding: 'utf8',
  }).stdout?.trim();
  const reason = check(input, loadTerms() ?? [], { branch });
  if (reason) {
    process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${reason}\n`);
    process.exit(2);
  }
}
