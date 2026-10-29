import { WebhookDelivery, type DeliveryJob, type DeliveryStore } from "./delivery";
import { DEFAULT_RETRY_POLICY, isRetryable, nextDelayMs } from "./retry-policy";

const NOW = new Date("2026-02-10T09:00:00.000Z");
const clock = { now: () => NOW };
const job: DeliveryJob = { id: "job_7", tenantId: "tenant_a", url: "https://hooks.example.test/orders", body: { event: "order.created" }, attempts: 0, nextAttemptAt: NOW.toISOString() };

function makeStore(overrides: Partial<DeliveryJob> = {}) {
  const delivered: string[] = [], dead: string[] = [], retries: Date[] = [];
  let renewals = 0;
  const claimed = { ...job, ...overrides };
  const store: DeliveryStore = {
    claimNext: async () => claimed,
    renewLease: async () => { renewals += 1; return true; },
    markDelivered: async (id) => { delivered.push(id); },
    markDead: async (id) => { dead.push(id); },
    scheduleRetry: async (_id, _worker, nextAttemptAt) => { retries.push(nextAttemptAt); },
  };
  return { store, delivered, dead, retries, renewals: () => renewals };
}

function makeHttp(status: number) {
  const calls: Array<{ headers: Record<string, string> }> = [];
  const http = { post: async (_url: string, _body: unknown, headers: Record<string, string>) => { calls.push({ headers }); return { status }; } };
  return { http, calls };
}

const options = { workerId: "w1" };

describe("WebhookDelivery", () => {
  it("claims, renews and delivers a pending webhook", async () => {
    const { store, delivered, renewals } = makeStore();
    const delivery = new WebhookDelivery(store, makeHttp(204).http, clock, options);
    expect(await delivery.pulse()).toBe("delivered");
    expect(delivered).toEqual(["job_7"]);
    expect(renewals()).toBe(1);
  });

  it("retries a server error with one idempotency key", async () => {
    const { store, retries } = makeStore({ attempts: 2 });
    const { http, calls } = makeHttp(503);
    const delivery = new WebhookDelivery(store, http, clock, options);
    expect(await delivery.pulse()).toBe("retry_scheduled");
    expect(retries).toHaveLength(1);
    expect(calls[0].headers["idempotency-key"]).toContain("job_7");
  });

  it("dead-letters after the attempt budget", async () => {
    const { store, dead } = makeStore({ attempts: 5 });
    const delivery = new WebhookDelivery(store, makeHttp(500).http, clock, options);
    expect(await delivery.pulse()).toBe("dead_lettered");
    expect(dead).toEqual(["job_7"]);
  });
});

describe("retry policy", () => {
  it("grows and caps the delay", () => {
    const first = nextDelayMs(DEFAULT_RETRY_POLICY, 1, () => 0.5);
    const second = nextDelayMs(DEFAULT_RETRY_POLICY, 2, () => 0.5);
    const capped = nextDelayMs({ ...DEFAULT_RETRY_POLICY, maxDelayMs: 8_000 }, 4, () => 0.5);
    expect(second).toBe(first * 2);
    expect(capped).toBeLessThanOrEqual(8_000);
  });

  it("does not retry deterministic 4xx responses", () => {
    expect(isRetryable({ status: 404 })).toBe(false);
    expect(isRetryable({ status: 503 })).toBe(true);
  });
});
