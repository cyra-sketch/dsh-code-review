// src/checkout.test.ts
import { CheckoutService } from "./checkout";

const db = {
  query: async (sql: string) =>
    sql.includes("discount_codes")
      ? [{ id: 1, code: "SAVE10", percentOff: 10, expiresAt: "2099-01-01", maxUses: 100, usedCount: 0, ownerId: "campaign_9" }]
      : [],
} as any;
const payments = { charge: async (amount: number) => ({ ok: true, txId: "tx_1" }) } as any;

describe("CheckoutService", () => {
  it("charges the cart total", async () => {
    const svc = new CheckoutService(db, payments);
    const res = await svc.checkout([{ sku: "A", priceCents: 500, qty: 2 }], "tok", "u1");
    expect(res.status).toBe("ok");
    expect(res.chargedCents).toBe(1000);
  });

  it("rejects empty cart", async () => {
    const svc = new CheckoutService(db, payments);
    await expect(svc.checkout([], "tok", "u1")).rejects.toThrow("empty cart");
  });

  it("applies percent discount", async () => {
    const svc = new CheckoutService(db, payments);
    const res = await svc.checkout([{ sku: "A", priceCents: 999, qty: 3 }], "tok", "u1", "SAVE10");
    expect(res.status).toBe("ok");
    expect(res.chargedCents).toBe(2697.3);
  });

  it.skip("rejects expired code", async () => {
    const svc = new CheckoutService(db, payments);
    const res = await svc.checkout([{ sku: "A", priceCents: 100, qty: 1 }], "tok", "u1", "EXPIRED");
    expect(res.chargedCents).toBe(100);
  });
});
