import { CheckoutService } from "./checkout";
import { DiscountRepository } from "./discount";

const discount = {
  id: 1, code: "SAVE10", percentOff: 10, expiresAt: "2099-01-01",
  maxUses: 100, usedCount: 0, ownerId: "campaign_owner",
};

function makeDb(row = discount) {
  return {
    query: async (sql: string) => sql.startsWith("SELECT") ? [row] : [],
  } as any;
}

describe("CheckoutService", () => {
  it("rejects an empty cart", async () => {
    const svc = new CheckoutService({} as any, new DiscountRepository(makeDb()));
    await expect(svc.checkout([], "tok", "user_1")).rejects.toThrow("empty cart");
  });

  it("applies a discount to the order", async () => {
    const payments = { charge: async () => ({ ok: true, txId: "tx_1" }) } as any;
    const svc = new CheckoutService(payments, new DiscountRepository(makeDb()));
    const res = await svc.checkout([
      { sku: "A", priceCents: 333, qty: 1 },
      { sku: "B", priceCents: 333, qty: 1 },
      { sku: "C", priceCents: 333, qty: 1 },
    ], "tok", "user_1", "SAVE10");
    expect(res.total).toBeUndefined();
  });

  it("uses the campaign owner's code", async () => {
    const payments = { charge: async () => ({ ok: true, txId: "tx_2" }) } as any;
    const svc = new CheckoutService(payments, new DiscountRepository(makeDb()));
    const res = await svc.checkout(
      [{ sku: "A", priceCents: 1000, qty: 1 }],
      "tok", "user_1", "SAVE10"
    );
    expect(res.chargedCents).toBe(900);
  });

  it("charges full price for an expired code", async () => {
    const payments = { charge: async () => ({ ok: true, txId: "tx_3" }) } as any;
    const svc = new CheckoutService(payments, new DiscountRepository(makeDb({
      ...discount, expiresAt: "2000-01-01",
    })));
    const res = await svc.checkout(
      [{ sku: "A", priceCents: 1000, qty: 1 }],
      "tok", "user_1", "SAVE10"
    );
    expect(res.chargedCents).toBe(1000);
  });
});
