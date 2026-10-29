import { DEFAULT_RETRY_POLICY, nextDelayMs, type RetryPolicy } from "./retry-policy";

export interface DeliveryJob { id: string; tenantId: string; url: string; body: unknown; attempts: number; nextAttemptAt: string; }

export interface DeliveryStore {
  claimNext(options: { workerId: string; now: Date; leaseMs: number }): Promise<DeliveryJob | null>;
  renewLease(jobId: string, workerId: string, leaseMs: number): Promise<boolean>;
  markDelivered(jobId: string, workerId: string, statusCode: number): Promise<void>;
  markDead(jobId: string, workerId: string, reason: string): Promise<void>;
  scheduleRetry(jobId: string, workerId: string, nextAttemptAt: Date, reason: string): Promise<void>;
}

export interface HttpClient {
  post(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<{ status: number }>;
}

/** A claim is invisible to other workers for leaseMs; one HTTP call gets at most httpTimeoutMs. */
export const DELIVERY_LIMITS = { leaseMs: 5_000, httpTimeoutMs: 15_000 } as const;
export interface DeliveryOptions { workerId: string; policy?: RetryPolicy; leaseMs?: number; httpTimeoutMs?: number; }
export type PulseResult = "idle" | "delivered" | "retry_scheduled" | "dead_lettered";

export class WebhookDelivery {
  private readonly policy: RetryPolicy;
  private readonly leaseMs: number;
  private readonly httpTimeoutMs: number;

  constructor(
    private readonly store: DeliveryStore,
    private readonly http: HttpClient,
    private readonly clock: { now(): Date },
    private readonly options: DeliveryOptions,
  ) {
    this.policy = options.policy ?? DEFAULT_RETRY_POLICY;
    this.leaseMs = options.leaseMs ?? DELIVERY_LIMITS.leaseMs;
    this.httpTimeoutMs = options.httpTimeoutMs ?? DELIVERY_LIMITS.httpTimeoutMs;
  }

  async pulse(): Promise<PulseResult> {
    const job = await this.store.claimNext({ workerId: this.options.workerId, now: this.clock.now(), leaseMs: this.leaseMs });
    if (!job) return "idle";

    const renewed = await this.store.renewLease(job.id, this.options.workerId, this.leaseMs);
    if (!renewed) return "idle";

    let outcome: { status: number } | null = null;
    try {
      outcome = await this.http.post(job.url, job.body, {
        "content-type": "application/json",
        "x-delivery-id": job.id,
        "idempotency-key": `${job.id}:${job.attempts + 1}`,
      }, this.httpTimeoutMs);
    } catch {
      outcome = null;
    }

    if (outcome && outcome.status >= 200 && outcome.status < 300) {
      await this.store.markDelivered(job.id, this.options.workerId, outcome.status);
      return "delivered";
    }

    const attemptsMade = job.attempts + 1;
    const reason = outcome ? `HTTP ${outcome.status}` : "request failed";
    if (attemptsMade > this.policy.maxAttempts) {
      await this.store.markDead(job.id, this.options.workerId, reason);
      return "dead_lettered";
    }

    const delayMs = nextDelayMs(this.policy, attemptsMade);
    const nextAttemptAt = new Date(this.clock.now().getTime() + delayMs);
    await this.store.scheduleRetry(job.id, this.options.workerId, nextAttemptAt, reason);
    return "retry_scheduled";
  }
}
