interface PaymentGateway { charge(amountCents: number, token: string): Promise<{ ok: boolean; txId?: string; error?: string }> }
interface Db { query(sql: string, params?: unknown[]): Promise<any[]> }
interface CartItem { sku: string; priceCents: number; qty: number }
interface DiscountCode {
  id: number;
  code: string;
  fixedAmountOff: number;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  ownerId: string;
}

export class CheckoutService {
  constructor(private db: Db, private payments: PaymentGateway) {}

  async checkout(items: CartItem[], paymentToken: string, userId: string, discountCode?: string) {
    if (!items.length) throw new Error("empty cart");
    let total = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
    if (!discountCode) return this.charge(total, paymentToken);

    const code = await this.lookupCode(discountCode, userId);
    if (!code) throw new Error("invalid discount code");
    if (!await this.reserveCode(code.id)) throw new Error("discount code exhausted");
    total = Math.max(0, total - code.fixedAmountOff);

    try {
      const result = await this.charge(total, paymentToken);
      if (result.status === "payment_failed") await this.releaseCode(code.id);
      return result;
    } catch (error) {
      await this.releaseCode(code.id);
      throw error;
    }
  }

  private async lookupCode(code: string, userId: string): Promise<DiscountCode | null> {
    const rows = await this.db.query(
      "SELECT * FROM discount_codes WHERE code = $1 AND ownerId = $2",
      [code, userId]
    );
    if (!rows.length) return null;
    const discount = rows[0] as DiscountCode;
    if (!Number.isInteger(discount.fixedAmountOff) || discount.fixedAmountOff < 0) return null;
    const expiresAt = Date.parse(discount.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    if (discount.usedCount >= discount.maxUses) return null;
    return discount;
  }

  private async reserveCode(id: number): Promise<boolean> {
    const rows = await this.db.query(
      "UPDATE discount_codes SET usedCount = usedCount + 1 WHERE id = $1 AND usedCount < maxUses RETURNING id",
      [id]
    );
    return rows.length === 1;
  }

  private async releaseCode(id: number): Promise<void> {
    await this.db.query(
      "UPDATE discount_codes SET usedCount = GREATEST(usedCount - 1, 0) WHERE id = $1",
      [id]
    );
  }

  private async charge(amountCents: number, paymentToken: string) {
    const result = await this.payments.charge(amountCents, paymentToken);
    if (!result.ok) return { status: "payment_failed" as const, error: result.error };
    return { status: "ok" as const, txId: result.txId, chargedCents: amountCents };
  }
}
