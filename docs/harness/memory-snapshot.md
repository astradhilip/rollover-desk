# Memory snapshot

Claude Code's project memory sits outside git. This is a scrubbed copy, first taken at M0 and checked again at M6, when it was still accurate.

**Assignment:** second-round take-home for Newmark, Dallas TX: staff software engineer at a commercial real estate company, self-chosen problem. Prompts and commit history are kept for a harness conversation. The brief's due date is contradictory: the header says 11/01/26, the body says Oct 13.

**Working rules:**

- One feature branch per milestone: implement, test, review, commit, push, PR against `main`, CI, merge, then the next.
- Private reference material is never named in the repo; concepts only, written fresh.
- API uses ports and adapters; SQLite now, PostgreSQL ready. Dashboard uses Next.js, React and TypeScript in the Blueprint direction, light and dark, following the design skills unmodified.
- Synthetic data only. Auth and multi-tenancy are built.
- The GitHub token is never pasted in chat, printed, or written to a file.
