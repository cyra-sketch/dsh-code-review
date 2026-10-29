import { CheckoutService } from "./checkout";

const discount = {
  id: 1, code: "SAVE500", fixedAmountOff: 500, expiresAt: "2099-01-01",
  maxUses: 100, usedCount: 0, ownerId: "u1",
};

function makeDb(row = discount) {
  const queries: { sql: string; params?: unknown[] }[] = [];
  return {
    queries,
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT")) return [row];
      if (sql.includes("usedCount + 1")) return [{ id: row.id }];
      return [];
    },
  } as any;
}

describe("CheckoutService", () => {
  it("rejects an empty cart", async () => {
    const svc = new CheckoutService(makeDb(), {} as any);
    await expect(svc.checkout([], "tok", "u1")).rejects.toThrow("empty cart");
  });

  it("applies a fixed discount in integer cents", async () => {
    const db = makeDb();
    const charge = async (amount: number) => ({ ok: true, txId: "tx_1", amount });
    const svc = new CheckoutService(db, { charge } as any);
    const res = await svc.checkout([{ sku: "A", priceCents: 999, qty: 3 }], "tok", "u1", "SAVE500");
    expect(res.chargedCents).toBe(2497);
    expect(db.queries[1].params).toEqual([1]);
  });

  it("never discounts below zero", async () => {
    const svc = new CheckoutService(makeDb(), { charge: async () => ({ ok: true, txId: "tx_2" }) } as any);
    const res = await svc.checkout([{ sku: "A", priceCents: 100, qty: 1 }], "tok", "u1", "SAVE500");
    expect(res.chargedCents).toBe(0);
  });

  it("rejects expired codes before charging", async () => {
    const charge = async () => ({ ok: true });
    const svc = new CheckoutService(makeDb({ ...discount, expiresAt: "2000-01-01" }), { charge } as any);
    await expect(svc.checkout([{ sku: "A", priceCents: 100, qty: 1 }], "tok", "u1", "SAVE500")).rejects.toThrow("invalid");
  });

  it("releases a reservation when payment fails", async () => {
    const db = makeDb();
    const svc = new CheckoutService(db, { charge: async () => ({ ok: false, error: "declined" }) } as any);
    const res = await svc.checkout([{ sku: "A", priceCents: 999, qty: 1 }], "tok", "u1", "SAVE500");
    expect(res.status).toBe("payment_failed");
    expect(db.queries.some(({ sql }: { sql: string }) => sql.includes("usedCount - 1"))).toBe(true);
  });
});
