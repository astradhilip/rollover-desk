# Claude Code harness

How the AI tooling was set up, and why. Every milestone was built by Claude Code inside this harness, one reviewed pull request each. The prompts are in [harness/prompt-log.md](harness/prompt-log.md), and the commit history is the other half of the record.

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
| Built-in `/code-review` and `/security-review`          | Run at the gate on each milestone's diff                                                     | A second reader that hasn't seen the reasoning behind the code          |
| impeccable `audit` and `polish`                         | Screenshot review of every screen at three widths, both themes                               | The design skills check the result, not just guide the writing          |
| `scripts/leak-scan.mjs`                                 | Scans files and full history                                                                 | Private material must not reach the repo, even in a deleted line        |
| `scripts/github-pr.mjs`                                 | PRs through the API                                                                          | The token stays in git's credential helper                              |
| `.mcp.json`: `rollover-desk` server                     | Read-only tools over the running API                                                         | Lets Claude Code check the app's real numbers. Signs in as the viewer   |
| Memory                                                  | Assignment facts and working rules                                                           | Outside git, so a scrubbed copy is in `harness/memory-snapshot.md`      |
| Context window                                          | `STATUS.md` is the resume point; formulas load on demand                                     | A new session can resume cheaply                                        |

## What the loop caught

The reviews found real defects, not just style:

- **M4a (security):** the dashboard's login limiter could be bypassed by spoofing `X-Forwarded-For` when no proxy sets it. Fixed, and the proxy requirement is in `STATUS.md`.
- **M3b (code):** parallel confirms that could leave two active rent rolls. Fixed with a partial unique index and a transaction, plus a race test.
- **M4b (code):** a pipeline note that could never be edited on a "Vacating" card.
- **M5 (formulas):** four places where the workbook disagreed with the domain, including missing rent shown as $0 and a blank as-of date read as 1899.
- **M5 (second pass):** the fix for the blank as-of date was itself incomplete. The reviewer was given the code, not my conclusion, and found it.

Each finding I declined is listed in its PR with the reason.

**Reviewer reports are model output.** Each report was checked before acting on it. Two kinds of claim were corrected that way:

- claims that something was "verified" when it had only been read,
- and suggested fixes that would have broken another rule.

## Handing over between sessions

Work moved between sessions and accounts mid-milestone. `STATUS.md`, the prompt log and project memory were enough to resume: the next session read them, found the review findings not yet applied, and continued from there. No step was repeated.

## Declined

- **Claude Code plugin:** one repo has nothing to distribute. The "Excel plugin" is the Office add-in, which was cut; its design is in [EXCEL-ADDIN.md](EXCEL-ADDIN.md).
- **Mods:** no custom panel or status line solved a real problem here.
- **Third-party MCP servers:** not needed.

## Limits

- The forbidden-term list is local, so CI scans for credentials only. The full scan runs on the developer machine before each push.
- `guard.mjs` is a safety net, not a security boundary: an unusual command could evade its patterns.

## Incident: a failed scan that was not noticed

During M2 the leak scan failed on an invented tenant name that matched the private term list, but piping its output through `tail` hid the exit code, so the commit and push went ahead. The later check of the output caught it before merge. The PR was closed, its branch deleted and recreated from `main`, and the gate now requires the scan to be chained with `&&` and never piped. The guard also can't see text written through a shell heredoc, which is how the name got past it. The closed PR's ref remains on GitHub in this private repo.
