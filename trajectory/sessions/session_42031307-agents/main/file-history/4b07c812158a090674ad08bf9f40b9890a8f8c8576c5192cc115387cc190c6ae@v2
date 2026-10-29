import { CheckoutService } from "./checkout";

const payments = { charge: async () => ({ ok: true, txId: "tx_1" }) } as any;

describe("CheckoutService", () => {
  it("rejects an empty cart", async () => {
    const svc = new CheckoutService(payments);
    await expect(svc.checkout([], "tok")).rejects.toThrow("empty cart");
  });
});
