const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

/** Failed logins per client and email. In memory: enough for one process, and listed in the production path. */
export class LoginRateLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Counts an attempt before the slow password check, so parallel requests can't all pass.
   * Returns seconds to wait when refused, or 0 when the attempt may go ahead.
   */
  reserve(key: string, max = MAX_FAILURES): number {
    const now = this.now();
    const entry = this.failures.get(key);
    if (entry && entry.resetAt > now) {
      if (entry.count >= max) return Math.ceil((entry.resetAt - now) / 1000);
      entry.count += 1;
      return 0;
    }
    if (this.failures.size >= MAX_TRACKED) this.prune(now);
    this.failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return 0;
  }

  /** The attempt failed for a reason other than the password, so it shouldn't count. */
  release(key: string): void {
    const entry = this.failures.get(key);
    if (entry && entry.count > 0) entry.count -= 1;
  }

  clear(key: string): void {
    this.failures.delete(key);
  }

  private prune(now: number) {
    for (const [key, entry] of this.failures) if (entry.resetAt <= now) this.failures.delete(key);
    // Still full of live entries: drop the oldest rather than grow without limit under attack.
    while (this.failures.size >= MAX_TRACKED) this.failures.delete(this.failures.keys().next().value!);
  }
}
