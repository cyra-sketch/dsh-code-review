import { applyFixedDiscount } from "./cart";

describe("applyFixedDiscount", () => {
  it("subtracts a partial discount", () => {
    expect(applyFixedDiscount(1000, 250)).toEqual({
      chargedCents: 750,
      appliedDiscountCents: 250,
    });
  });

  it("supports a zero total and a zero discount", () => {
    expect(applyFixedDiscount(0, 0)).toEqual({ chargedCents: 0, appliedDiscountCents: 0 });
    expect(applyFixedDiscount(1000, 0)).toEqual({ chargedCents: 1000, appliedDiscountCents: 0 });
  });

  it("caps the discount at the total", () => {
    expect(applyFixedDiscount(100, 500)).toEqual({ chargedCents: 0, appliedDiscountCents: 100 });
  });

  it("rejects negative amounts", () => {
    expect(() => applyFixedDiscount(-1, 0)).toThrow(RangeError);
    expect(() => applyFixedDiscount(100, -1)).toThrow(RangeError);
  });

  it("rejects fractional and unsafe amounts", () => {
    expect(() => applyFixedDiscount(10.5, 1)).toThrow(RangeError);
    expect(() => applyFixedDiscount(100, Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
