import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export interface PriceQuote {
  price: number;
  date: string;
  source: string;
}

export interface PriceTarget {
  id: number;
  market: string;
  ticker: string | null;
  currency: string;
}

/**
 * 가격 조회 추상화. 지금은 수동 입력(ManualPriceProvider)만 있다.
 * 나중에 외부 시세 소스를 붙일 때 이 인터페이스를 구현하고 getPriceProvider()에서 바꿔 끼운다.
 */
export interface PriceProvider {
  readonly name: string;
  getLatest(target: PriceTarget): Promise<PriceQuote | null>;
}

export class ManualPriceProvider implements PriceProvider {
  readonly name = "manual";

  async getLatest(target: PriceTarget): Promise<PriceQuote | null> {
    const row = db
      .select()
      .from(schema.prices)
      .where(and(eq(schema.prices.stockId, target.id)))
      .orderBy(desc(schema.prices.date), desc(schema.prices.id))
      .limit(1)
      .get();
    return row ? { price: row.price, date: row.date, source: row.source } : null;
  }
}

let provider: PriceProvider = new ManualPriceProvider();

export function getPriceProvider(): PriceProvider {
  return provider;
}

export function setPriceProvider(p: PriceProvider) {
  provider = p;
}
