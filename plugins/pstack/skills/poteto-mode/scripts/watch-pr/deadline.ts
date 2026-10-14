export class DeadlineExceeded extends Error {
  constructor() {
    super("watch deadline reached");
    this.name = "DeadlineExceeded";
  }
}

/** One monotonic budget shared by discovery, commands, polling and retries. */
export class WatchDeadline {
  private readonly expiresAt: number;
  private readonly now: () => number;
  constructor(timeout: number, now: () => number) {
    this.now = now;
    this.expiresAt = timeout > 0 ? now() + timeout : Infinity;
  }
  remaining(): number {
    return Math.max(0, this.expiresAt - this.now());
  }
}
