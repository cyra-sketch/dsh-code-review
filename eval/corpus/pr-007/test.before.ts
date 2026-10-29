import { WebhookDelivery, type DeliveryStore } from "./delivery";

const job = { id: "job_7", tenantId: "tenant_a", url: "https://hooks.example.test/orders", body: { event: "order.created" }, attempts: 0, nextAttemptAt: "2026-02-10T09:00:00.000Z" };

function store(markDelivered: (id: string) => void, markFailed: (id: string, error: string) => void): DeliveryStore {
  return { claimNext: async () => job, markDelivered: async (id) => markDelivered(id), markFailed: async (id, error) => markFailed(id, error) };
}

describe("WebhookDelivery", () => {
  it("claims and delivers a pending webhook", async () => {
    const delivered: string[] = [];
    const delivery = new WebhookDelivery(store((id) => delivered.push(id), () => { throw new Error("unexpected failure"); }), { post: async () => ({ status: 204 }) });
    expect(await delivery.pulse()).toBe("delivered");
    expect(delivered).toEqual(["job_7"]);
  });

  it("records a non-2xx response as failed", async () => {
    const failures: string[] = [];
    const delivery = new WebhookDelivery(store(() => { throw new Error("unexpected delivery"); }, (_id, error) => failures.push(error)), { post: async () => ({ status: 500 }) });
    expect(await delivery.pulse()).toBe("failed");
    expect(failures).toEqual(["HTTP 500"]);
  });
});
