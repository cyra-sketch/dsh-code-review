import { CheckoutService } from "./checkout";

const db = { query: async () => [] } as any;
const payments = { charge: async () => ({ ok: true, txId: "tx_1" }) } as any;

describe("CheckoutService", () => {
  it("rejects an empty cart", async () => {
    const svc = new CheckoutService(db, payments);
    await expect(svc.checkout([], "tok", "u1")).rejects.toThrow("empty cart");
  });
});
