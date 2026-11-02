// Shared by the hooks and scripts/leak-scan.mjs. No dependencies, so it runs before install.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TERMS_FILE = '.claude/forbidden-terms.local';

/** Credential shapes that must never reach the repo, the log or a command line. */
export const TOKEN_PATTERNS = [
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{30,}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /https:\/\/[^/\s:@]+:[^/\s@]+@github\.com/g,
];

export function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

/** One term per line. The list stays out of git; it names what the repo must not mention. */
export function loadTerms(root = projectRoot()) {
  const file = path.join(root, TERMS_FILE);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const anyCase = (s) => s.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const termPattern = (t) => t.trim().split(/\s+/).map(escape).map(anyCase).join('[\\s_-]+');

/**
 * Whole words only, because a bare substring match flags ordinary words that merely contain a term.
 * A word edge also falls at `_`, `-` and a camelCase hump, so `term_notes` and `myTermDesign` match.
 * Words of a multi-word term may be joined by any space, `_` or `-`.
 */
export function termRegex(terms) {
  if (!terms.length) return null;
  const start = '(?:(?<![A-Za-z0-9])|(?<=[a-z0-9])(?=[A-Z]))';
  return new RegExp(`${start}(?:${terms.map(termPattern).join('|')})(?![a-z0-9])`, 'g');
}

/** True when this module is run directly, including through a symlinked path. */
export function isMain(metaUrl) {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

export function hasToken(text) {
  return TOKEN_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function findTerm(text, terms) {
  const re = termRegex(terms ?? []);
  return re ? (text.match(re)?.[0] ?? null) : null;
}

/** Text safe to commit: credentials and listed terms are replaced. */
export function redact(text, terms) {
  let out = text;
  for (const re of TOKEN_PATTERNS) out = out.replace(re, '[redacted-token]');
  const re = termRegex(terms ?? []);
  return re ? out.replace(re, '[redacted]') : out;
}
