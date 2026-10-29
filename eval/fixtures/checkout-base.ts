interface PaymentGateway { charge(amountCents: number, token: string): Promise<{ ok: boolean; txId?: string; error?: string }> }
interface CartItem { priceCents: number; qty: number }

export class CheckoutService {
  constructor(private payments: PaymentGateway) {}

  async checkout(items: CartItem[], paymentToken: string) {
    if (!items.length) throw new Error("empty cart");
    const total = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
    const result = await this.payments.charge(total, paymentToken);
    if (!result.ok) return { status: "payment_failed" as const, error: result.error };
    return { status: "ok" as const, txId: result.txId, chargedCents: total };
  }
}
