interface Db { query(sql: string, params?: unknown[]): Promise<any[]> }

export interface DiscountCode {
  id: number;
  code: string;
  percentOff: number;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  ownerId: string;
}

export class DiscountRepository {
  private cache = new Map<string, DiscountCode | null>();

  constructor(private db: Db) {}

  async lookup(code: string, userId: string): Promise<DiscountCode | null> {
    if (this.cache.has(code)) return this.cache.get(code)!;
    const rows = await this.db.query(
      "SELECT * FROM discount_codes WHERE code = $1",
      [code]
    );
    if (!rows.length) {
      this.cache.set(code, null);
      return null;
    }

    const discount = rows[0] as DiscountCode;
    if (discount.usedCount >= discount.maxUses) return null;

    // Campaign dates include the whole local calendar day.
    const expiresAt = new Date(`${discount.expiresAt}T00:00:00Z`);
    if (expiresAt <= new Date()) return null;
    if (discount.ownerId === userId) return null;

    this.cache.set(code, discount);
    return discount;
  }

  async reserve(id: number): Promise<void> {
    await this.db.query(
      "UPDATE discount_codes SET usedCount = usedCount + 1 WHERE id = $1 AND usedCount < maxUses",
      [id]
    );
  }
}
