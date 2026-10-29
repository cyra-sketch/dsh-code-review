export interface RetryPolicy {
  /** Total delivery attempts allowed, including the first. */
  maxAttempts: number;
  /** Delay before the first retry, before jitter. */
  baseDelayMs: number;
  /** Hard ceiling for any single retry delay. */
  maxDelayMs: number;
  jitterRatio: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000, jitterRatio: 0.25 };

/** Transport errors, 408 and 429 are retryable; other 4xx responses are not. */
export function isRetryable(outcome: { status: number } | null): boolean {
  if (!outcome) return true;
  if (outcome.status === 408 || outcome.status === 429) return true;
  if (outcome.status >= 400 && outcome.status < 500) return false;
  return outcome.status >= 500;
}

/** `attempt` is the one-based number of the attempt that just failed. */
export function nextDelayMs(
  policy: RetryPolicy,
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponential = policy.baseDelayMs * 2 ** attempt;
  const capped = Math.min(exponential, policy.maxDelayMs);
  const jitter = capped * policy.jitterRatio * (random() * 2 - 1);
  return Math.round(capped + jitter);
}
