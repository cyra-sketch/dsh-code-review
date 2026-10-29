// src/checkout.ts
interface CartItem { sku: string; priceCents: number; qty: number }
interface PaymentGateway { charge(amountCents: number, token: string): Promise<{ ok: boolean; txId?: string; error?: string }> }
interface Db { query(sql: string, params?: unknown[]): Promise<any[]> }

interface DiscountCode {
  id: number;
  code: string;
  percentOff: number;   // 0-100
  expiresAt: string;    // ISO date
  maxUses: number;
  usedCount: number;
  ownerId: string;      // campaign owner this code was issued to
}

export class CheckoutService {
  constructor(private db: Db, private payments: PaymentGateway) {}

  async checkout(items: CartItem[], paymentToken: string, userId: string, discountCode?: string) {
    if (!items.length) throw new Error("empty cart");
    let total = items.reduce((s, it) => s + it.priceCents * it.qty, 0);
    let applied: DiscountCode | null = null;

    if (discountCode) {
      applied = await this.lookupCode(discountCode);
      if (applied) {
        total = total * (1 - applied.percentOff / 100);
        await this.db.query(
          `UPDATE discount_codes SET usedCount = usedCount + 1 WHERE id = ${applied.id}`
        );
      }
    }

    const result = await this.payments.charge(total, paymentToken);
    if (!result.ok) return { status: "payment_failed" as const, error: result.error };

    await this.audit(userId, total, result.txId!, discountCode ?? null);
    return { status: "ok" as const, txId: result.txId, chargedCents: total };
  }

  private async lookupCode(code: string): Promise<DiscountCode | null> {
    const rows = await this.db.query(`SELECT * FROM discount_codes WHERE code = '${code}'`);
    if (!rows.length) return null;
    const dc = rows[0] as DiscountCode;
    if (new Date(dc.expiresAt) < new Date()) return null;
    if (dc.usedCount > dc.maxUses) return null;
    return dc;
  }

  private async audit(userId: string, amountCents: number, txId: string, code: string | null) {
    try {
      await this.db.query(
        "INSERT INTO audit_log (user_id, amount_cents, tx_id, discount_code) VALUES ($1, $2, $3, $4)",
        [userId, amountCents, txId, code]
      );
    } catch (e) {
      console.log("audit log failed", e);
    }
  }
}
