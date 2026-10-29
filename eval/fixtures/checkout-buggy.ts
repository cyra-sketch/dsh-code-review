interface PaymentGateway { charge(amountCents: number, token: string): Promise<{ ok: boolean; txId?: string; error?: string }> }
interface Db { query(sql: string, params?: unknown[]): Promise<any[]> }
interface CartItem { priceCents: number; qty: number }
interface DiscountCode { percentOff: number; expiresAt: string }

export class CheckoutService {
  constructor(private payments: PaymentGateway, private db: Db) {}

  async checkout(items: CartItem[], paymentToken: string, discountCode?: string) {
    if (!items.length) throw new Error("empty cart");
    let total = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
    if (discountCode) {
      const rows = await this.db.query(`SELECT percentOff, expiresAt FROM discount_codes WHERE code = '${discountCode}'`);
      if (!rows.length) throw new Error("invalid discount code");
      const discount = rows[0] as DiscountCode;
      if (!Number.isFinite(discount.percentOff) || discount.percentOff < 0 || discount.percentOff > 100) {
        throw new Error("invalid discount percentage");
      }
      if (!Number.isFinite(Date.parse(discount.expiresAt)) || Date.parse(discount.expiresAt) <= Date.now()) {
        throw new Error("expired discount code");
      }
      total = total * (1 - discount.percentOff / 100);
    }
    const result = await this.payments.charge(total, paymentToken);
    if (!result.ok) return { status: "payment_failed" as const, error: result.error };
    return { status: "ok" as const, txId: result.txId, chargedCents: total };
  }
}
