export interface DiscountResult {
  chargedCents: number;
  appliedDiscountCents: number;
}

export function applyFixedDiscount(totalCents: number, discountCents: number): DiscountResult {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError("totalCents must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(discountCents) || discountCents < 0) {
    throw new RangeError("discountCents must be a non-negative safe integer");
  }

  const appliedDiscountCents = Math.min(totalCents, discountCents);
  return {
    chargedCents: totalCents - appliedDiscountCents,
    appliedDiscountCents,
  };
}

// R4 low-risk formatting update
