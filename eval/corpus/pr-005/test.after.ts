import { createFixedDiscountAudit } from "./audit";

describe("createFixedDiscountAudit", () => {
  it("records integer-cent discount amounts", () => {
    expect(createFixedDiscountAudit({
      orderId: "order_1", operatorId: "user_1", totalCents: 1000, discountCents: 250,
    })).toEqual({
      orderId: "order_1", operatorId: "user_1", chargedCents: 750, appliedDiscountCents: 250,
    });
  });

  it("caps the discount at the order total", () => {
    const result = createFixedDiscountAudit({
      orderId: "order_2", operatorId: "user_2", totalCents: 100, discountCents: 500,
    });
    expect(result.chargedCents).toBe(0);
    expect(result.appliedDiscountCents).toBe(100);
  });

  it("rejects invalid amounts and missing identities", () => {
    expect(() => createFixedDiscountAudit({
      orderId: "order_3", operatorId: "user_3", totalCents: -1, discountCents: 0,
    })).toThrow(RangeError);
    expect(() => createFixedDiscountAudit({
      orderId: "", operatorId: "user_3", totalCents: 100, discountCents: 0,
    })).toThrow("missing audit identity");
  });
});
