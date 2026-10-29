// src/checkout.ts
interface CartItem { sku: string; priceCents: number; qty: number }
interface PaymentGateway { charge(amountCents: number, token: string): Promise<{ ok: boolean; txId?: string; error?: string }> }
interface Db { query(sql: string, params?: unknown[]): Promise<any[]> }

export class CheckoutService {
  constructor(private db: Db, private payments: PaymentGateway) {}

  async checkout(items: CartItem[], paymentToken: string, userId: string) {
    if (!items.length) throw new Error("empty cart");
    const total = items.reduce((s, it) => s + it.priceCents * it.qty, 0);
    const result = await this.payments.charge(total, paymentToken);
    if (!result.ok) return { status: "payment_failed" as const, error: result.error };
    return { status: "ok" as const, txId: result.txId, chargedCents: total };
  }
}
