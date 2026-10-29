import { createFixedDiscountAudit } from "./audit";

describe("createFixedDiscountAudit", () => {
  it("records integer-cent amounts and operator IP", () => {
    expect(createFixedDiscountAudit({
      orderId: "order_1", operatorId: "user_1", operatorIp: "203.0.113.10",
      totalCents: 1000, discountCents: 250,
    })).toEqual({
      orderId: "order_1", operatorId: "user_1", operatorIp: "203.0.113.10",
      chargedCents: 750, appliedDiscountCents: 250,
    });
  });

  it("caps the discount at the order total", () => {
    const result = createFixedDiscountAudit({
      orderId: "order_2", operatorId: "user_2", operatorIp: "203.0.113.11",
      totalCents: 100, discountCents: 500,
    });
    expect(result.chargedCents).toBe(0);
    expect(result.appliedDiscountCents).toBe(100);
  });

  it("rejects missing operator IP", () => {
    expect(() => createFixedDiscountAudit({
      orderId: "order_3", operatorId: "user_3", operatorIp: "",
      totalCents: 100, discountCents: 0,
    })).toThrow("missing audit identity");
  });
});
