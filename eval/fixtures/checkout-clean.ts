interface PaymentGateway { charge(amountCents: number, token: string): Promise<{ ok: boolean; txId?: string; error?: string }> }
interface Db { query(sql: string, params?: unknown[]): Promise<any[]> }
interface CartItem { priceCents: number; qty: number }
interface DiscountCode { percentOff: number; expiresAt: string }
interface AuditRecord {
  txId?: string;
  operatorId: string;
  operatorIp: string;
  chargedCents: number;
  discountCents: number;
  createdAt: string;
}

export class CheckoutService {
  constructor(private payments: PaymentGateway, private db: Db) {}

  async checkout(items: CartItem[], paymentToken: string, operatorId: string, operatorIp: string, discountCode?: string) {
    if (!items.length) throw new Error("empty cart");
    if (!operatorId?.trim() || !operatorIp?.trim()) throw new Error("missing operator identity");

    let total = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("invalid order total");

    let discountCents = 0;
    if (discountCode) {
      const rows = await this.db.query("SELECT percentOff, expiresAt FROM discount_codes WHERE code = ?", [discountCode]);
      if (!rows.length) throw new Error("invalid discount code");
      const discount = rows[0] as DiscountCode;
      if (!Number.isFinite(discount.percentOff) || discount.percentOff < 0 || discount.percentOff > 100) {
        throw new Error("invalid discount percentage");
      }
      if (!Number.isFinite(Date.parse(discount.expiresAt)) || Date.parse(discount.expiresAt) <= Date.now()) {
        throw new Error("expired discount code");
      }
      discountCents = Math.min(total, Math.round((total * discount.percentOff) / 100));
      total -= discountCents;
    }

    const result = await this.payments.charge(total, paymentToken);
    if (!result.ok) return { status: "payment_failed" as const, error: result.error };

    const audit: AuditRecord = {
      txId: result.txId,
      operatorId,
      operatorIp,
      chargedCents: total,
      discountCents,
      createdAt: new Date().toISOString(),
    };
    await this.db.query(
      "INSERT INTO checkout_audits (tx_id, operator_id, operator_ip, charged_cents, discount_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [audit.txId ?? null, audit.operatorId, audit.operatorIp, audit.chargedCents, audit.discountCents, audit.createdAt],
    );

    return { status: "ok" as const, txId: result.txId, chargedCents: total, audit };
  }
}
