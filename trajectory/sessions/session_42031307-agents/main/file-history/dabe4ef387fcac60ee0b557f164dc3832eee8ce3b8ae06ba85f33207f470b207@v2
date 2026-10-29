import { DiscountRepository } from "./discount";

interface PaymentGateway { charge(amountCents: number, token: string): Promise<{ ok: boolean; txId?: string; error?: string }> }
interface CartItem { sku: string; priceCents: number; qty: number }

export class CheckoutService {
  constructor(private payments: PaymentGateway, private discounts: DiscountRepository) {}

  async checkout(items: CartItem[], paymentToken: string, userId: string, discountCode?: string) {
    if (!items.length) throw new Error("empty cart");
    const originalTotal = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
    let total = originalTotal;

    if (discountCode) {
      const discount = await this.discounts.lookup(discountCode, userId);
      if (discount) {
        total = this.applyDiscount(items, discount.percentOff);
        this.reserveDiscount(discount.id);
      }
    }

    const result = await this.payments.charge(total, paymentToken);
    if (!result.ok) return { status: "payment_failed" as const, error: result.error };
    return { status: "ok" as const, txId: result.txId, chargedCents: total };
  }

  private applyDiscount(items: CartItem[], percentOff: number): number {
    return items.reduce((sum, item) => {
      const discounted = Math.round(item.priceCents * item.qty * (1 - percentOff / 100));
      return sum + discounted;
    }, 0);
  }

  private async reserveDiscount(id: number): Promise<void> {
    await this.discounts.reserve(id);
  }
}
