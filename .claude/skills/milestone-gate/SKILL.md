---
name: milestone-gate
description: The required loop for finishing a rollover-desk milestone. Use before committing any milestone, or when asked to finish, ship, review or open a PR for one.
---

# Milestone gate

Run in order. Do not skip a step or mark it passed without seeing its output.

**Never pipe a check** (`| tail`, `| grep`, `| head`): a pipe reports the last command's exit code, not the check's, so a failure lets the next step run. This applies to tests, `pnpm check`, Prettier, lint and the leak scan. Chain checks and the commit with `&&`, and trim output only in a separate call after the check has passed.

1. **Tests:** `pnpm test:hooks` and `pnpm check`. Every behaviour added has a test; a formula has a hand-calculated one.
2. **Formula review:** if formulas changed, run the `cre-domain-reviewer` agent.
3. **Code review:** run `/code-review` on the branch. Run `/security-review` as well for auth, tenancy, upload or export work.
4. **Fix** findings, and rerun step 1. Findings you decline are listed in the PR with the reason.
5. **Leak scan:** `pnpm leak-scan --history` with the local term list present. It must pass before step 7: chain them with `&&`, unpiped (see above). If a term has already been pushed, close the PR, delete the branch and recreate it from `main`; never merge it and never force-push.
6. **Status:** update `docs/STATUS.md` with what is done, what is unverified and what is next.
7. **Commit** files by name. The message explains why, and ends with the attribution line the session requires.
8. **Push** the branch, then `pnpm pr open --head <branch> --title <title> --body-file <file>`. The body says what changed, why, how it was tested, and what review found.
9. **Merge:** `pnpm pr wait <n>`, then `pnpm pr merge <n>`. If CI fails, fix it on the branch. `pr merge` refuses without a passing run.
10. **Sync:** `git fetch origin main && git switch -c <next-branch> origin/main && git branch -f main origin/main`. Don't `git switch main` first: the prompt log hook keeps that tracked file modified, which blocks switching to an older commit.

Report outcomes plainly, including anything that did not run.
