# Claude Code harness

How the AI tooling was set up, and why. The final version is completed at M6.

| Item                                                    | Use                                                                                          | Why                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `CLAUDE.md`                                             | Commands, layout, rules                                                                      | Kept short, because it loads in every session and costs context         |
| `.claude/settings.json`                                 | Allow and deny rules, hooks                                                                  | Rules a model can't forget, enforced by the harness                     |
| PreToolUse `guard.mjs`                                  | Blocks credentials, force-push, push to `main`, `git add -A`, secret writes, forbidden terms | Tested in `guard.test.mjs`, including planted violations                |
| PostToolUse `after-edit.mjs`                            | Format and lint each edit                                                                    | Errors return to the agent immediately                                  |
| UserPromptSubmit `log-prompt.mjs`                       | Appends redacted prompts to `harness/prompt-log.md`                                          | The assignment asks to keep prompts. Fails closed without the term list |
| Stop `stop-check.mjs`                                   | Typecheck and test changed packages                                                          | A turn can't end on a broken build                                      |
| Skill `milestone-gate`                                  | Test, review, scan, commit, PR, merge                                                        | One repeatable loop                                                     |
| Skill `cre-formulas`                                    | Definitions and worked examples                                                              | Loaded only when formulas are in play                                   |
| Skills `impeccable`, `ui-ux-pro-max`, `frontend-design` | Design guidance and detector                                                                 | Third-party, unmodified, licences kept                                  |
| Agent `cre-domain-reviewer`                             | Read-only recalculation of formulas                                                          | Independent of the code's own output                                    |
| `scripts/leak-scan.mjs`                                 | Scans files and full history                                                                 | Private material must not reach the repo, even in a deleted line        |
| `scripts/github-pr.mjs`                                 | PRs through the API                                                                          | The token stays in git's credential helper                              |
| Memory                                                  | Assignment facts and working rules                                                           | Outside git, so a scrubbed copy is in `harness/memory-snapshot.md`      |
| Context window                                          | `STATUS.md` is the resume point; formulas load on demand                                     | A new session can resume cheaply                                        |

## Declined

- **Claude Code plugin:** one repo has nothing to distribute. The "Excel plugin" is the Office add-in.
- **Mods:** no custom panel or status line solved a real problem here.
- **Third-party MCP servers:** not needed. The project's own read-only MCP server is a post-cut-line milestone.

## Limits

- The forbidden-term list is local, so CI scans for credentials only. The full scan runs on the developer machine before each push.
- `guard.mjs` is a safety net, not a security boundary: an unusual command could evade its patterns.
