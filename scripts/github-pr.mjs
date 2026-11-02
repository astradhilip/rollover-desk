#!/usr/bin/env node
// Opens and merges pull requests through the GitHub REST API (the gh CLI is not assumed).
// The token comes from git's credential helper for this one process. It is never printed or stored.
//
//   node scripts/github-pr.mjs open --head <branch> --title <title> --body-file <path>
//   node scripts/github-pr.mjs wait <number>     wait for CI on the PR's head commit
//   node scripts/github-pr.mjs merge <number>    merge commit; refuses unless CI passed
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findTerm, hasToken, loadTerms } from '../.claude/hooks/lib.mjs';

const REPO = 'astradhilip/rollover-desk';

let cached;
function token() {
  if (cached) return cached;
  const r = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\nusername=astradhilip\n\n',
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const t = r.stdout?.match(/^password=(.+)$/m)?.[1];
  if (!t) throw new Error('No stored GitHub credential.');
  cached = t;
  return t;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${data.message ?? ''}`);
  return data;
}

const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

/** Newest run per workflow for a commit, so a cancelled earlier run does not block a passing rerun. */
async function ciState(sha) {
  const { workflow_runs: runs } = await api('GET', `/actions/runs?head_sha=${sha}&per_page=50`);
  if (!runs.length) return 'none';
  const latest = new Map();
  for (const r of runs) {
    const seen = latest.get(r.workflow_id);
    if (
      !seen ||
      r.run_number > seen.run_number ||
      (r.run_number === seen.run_number && r.run_attempt > seen.run_attempt)
    )
      latest.set(r.workflow_id, r);
  }
  const current = [...latest.values()];
  if (current.some((r) => r.status !== 'completed')) return 'running';
  return current.every((r) => r.conclusion === 'success') ? 'success' : 'failure';
}

/** PR text is public to reviewers and outside the leak scan, so it is checked before sending. */
function assertClean(text) {
  const terms = loadTerms();
  if (!terms) throw new Error('No local term list, so PR text cannot be checked. Refusing to open.');
  if (hasToken(text) || findTerm(text, terms))
    throw new Error('PR text holds a credential or forbidden term.');
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'open') {
    const title = flag('title');
    const body = readFileSync(flag('body-file'), 'utf8');
    assertClean(`${title}\n${body}`);
    const pr = await api('POST', '/pulls', { head: flag('head'), base: 'main', title, body });
    console.log(`#${pr.number} ${pr.html_url}`);
  } else if (cmd === 'wait') {
    const deadline = Date.now() + 15 * 60_000;
    const { head } = await api('GET', `/pulls/${arg}`);
    for (;;) {
      const state = await ciState(head.sha);
      if (state === 'success' || state === 'failure') {
        console.log(`CI ${state} for ${head.sha.slice(0, 8)}`);
        process.exit(state === 'success' ? 0 : 1);
      }
      if (Date.now() > deadline) throw new Error(`CI still ${state} after 15 minutes`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  } else if (cmd === 'merge') {
    const { head, title } = await api('GET', `/pulls/${arg}`);
    const state = await ciState(head.sha);
    if (state !== 'success') throw new Error(`Refusing to merge: CI is ${state}.`);
    const merged = await api('PUT', `/pulls/${arg}/merge`, {
      merge_method: 'merge',
      sha: head.sha,
      commit_title: `Merge: ${title}`,
    });
    console.log(`Merged ${merged.sha.slice(0, 8)}`);
  } else if (cmd === 'close') {
    const pr = await api('PATCH', `/pulls/${arg}`, { state: 'closed' });
    console.log(`Closed #${pr.number}`);
  } else {
    throw new Error('Usage: github-pr.mjs open|wait|merge|close');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
