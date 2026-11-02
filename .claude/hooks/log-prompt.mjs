#!/usr/bin/env node
// UserPromptSubmit: appends each prompt, redacted, to the committed prompt log.
// Fails closed: with no term list it logs nothing, because it cannot know the text is safe to commit.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isMain, loadTerms, projectRoot, redact } from './lib.mjs';

export const LOG_FILE = 'docs/harness/prompt-log.md';

export function entry(prompt, terms, now = new Date()) {
  const safe = redact(prompt, terms)
    .trim()
    .replace(/<\/?pasted_content[^>]*>/g, '');
  return `\n### ${now.toISOString()}\n\n${safe}\n`;
}

if (isMain(import.meta.url)) {
  try {
    const { prompt } = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const terms = loadTerms();
    if (prompt && terms) appendFileSync(path.join(projectRoot(), LOG_FILE), entry(prompt, terms));
  } catch {
    // Logging must never block the prompt.
  }
}
