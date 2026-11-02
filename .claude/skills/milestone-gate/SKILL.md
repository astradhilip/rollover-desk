---
name: milestone-gate
description: The required loop for finishing a rollover-desk milestone. Use before committing any milestone, or when asked to finish, ship, review or open a PR for one.
---

# Milestone gate

Run in order. Do not skip a step or mark it passed without seeing its output.

1. **Tests:** `pnpm test:hooks` and `pnpm check`. Every behaviour added has a test; a formula has a hand-calculated one.
2. **Formula review:** if formulas changed, run the `cre-domain-reviewer` agent.
3. **Code review:** run `/code-review` on the branch. Run `/security-review` as well for auth, tenancy, upload or export work.
4. **Fix** findings, and rerun step 1. Findings you decline are listed in the PR with the reason.
5. **Leak scan:** `pnpm leak-scan --history` with the local term list present.
6. **Status:** update `docs/STATUS.md` with what is done, what is unverified and what is next.
7. **Commit** files by name. The message explains why, and ends with the attribution line the session requires.
8. **Push** the branch, then `pnpm pr open --head <branch> --title <title> --body-file <file>`. The body says what changed, why, how it was tested, and what review found.
9. **Merge:** `pnpm pr wait <n>`, then `pnpm pr merge <n>`. If CI fails, fix it on the branch. `pr merge` refuses without a passing run.
10. **Sync:** `git switch main && git pull --ff-only`, then branch for the next milestone.

Report outcomes plainly, including anything that did not run.
