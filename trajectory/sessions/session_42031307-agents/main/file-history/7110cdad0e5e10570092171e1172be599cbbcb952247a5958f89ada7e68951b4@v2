export interface FixedDiscountInput {
  orderId: string;
  operatorId: string;
  totalCents: number;
  discountCents: number;
}

export interface FixedDiscountAudit {
  orderId: string;
  operatorId: string;
  chargedCents: number;
  appliedDiscountCents: number;
}

export function createFixedDiscountAudit(input: FixedDiscountInput): FixedDiscountAudit {
  if (!input.orderId || !input.operatorId) throw new Error("missing audit identity");
  if (!Number.isSafeInteger(input.totalCents) || input.totalCents < 0) {
    throw new RangeError("totalCents must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(input.discountCents) || input.discountCents < 0) {
    throw new RangeError("discountCents must be a non-negative safe integer");
  }
  const appliedDiscountCents = Math.min(input.totalCents, input.discountCents);
  return {
    orderId: input.orderId,
    operatorId: input.operatorId,
    chargedCents: input.totalCents - appliedDiscountCents,
    appliedDiscountCents,
  };
}
