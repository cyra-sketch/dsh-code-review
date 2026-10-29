// src/checkout.test.ts
import { CheckoutService } from "./checkout";

const db = { query: async () => [] } as any;
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
});
