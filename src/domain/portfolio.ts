/**
 * 매매 기록 → 포지션, 포지션 → 포트폴리오 (순수 함수).
 * 평균단가는 이동평균법이고 수수료는 매수 원가에 포함한다. 매도 수수료는 실현손익에서 뺀다.
 * 원화 환산은 수동 입력한 최신 환율(통화 1단위당 원)을 쓴다.
 */

export interface TradeInput {
  id?: number;
  date: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
}

export interface Position {
  quantity: number;
  /** 주당 평균단가 (수수료 포함) */
  avgCost: number | null;
  /** 보유분 원가 */
  costBasis: number;
  realizedPnl: number;
  totalFees: number;
  firstBuyDate: string | null;
  lastTradeDate: string | null;
  /** 보유 수량보다 많이 판 기록 등 */
  errors: string[];
}

const EPS = 1e-9;

export function computePosition(trades: TradeInput[]): Position {
  const sorted = [...trades].sort((a, b) => (a.date === b.date ? (a.id ?? 0) - (b.id ?? 0) : a.date < b.date ? -1 : 1));
  let qty = 0;
  let cost = 0;
  let realized = 0;
  let fees = 0;
  let firstBuy: string | null = null;
  const errors: string[] = [];
  for (const t of sorted) {
    if (!(t.quantity > 0) || !(t.price >= 0) || !(t.fee >= 0)) {
      errors.push(`${t.date}: 수량·가격·수수료가 올바르지 않습니다.`);
      continue;
    }
    fees += t.fee;
    if (t.side === "buy") {
      qty += t.quantity;
      cost += t.quantity * t.price + t.fee;
      firstBuy ??= t.date;
    } else {
      if (t.quantity > qty + EPS) {
        errors.push(`${t.date}: 보유 수량(${qty})보다 많이 매도했습니다(${t.quantity}). 이 기록은 계산에서 제외했습니다.`);
        fees -= t.fee;
        continue;
      }
      const avg = qty > 0 ? cost / qty : 0;
      realized += t.quantity * t.price - t.fee - avg * t.quantity;
      cost -= avg * t.quantity;
      qty -= t.quantity;
      if (qty < EPS) {
        qty = 0;
        cost = 0;
      }
    }
  }
  return {
    quantity: qty,
    avgCost: qty > 0 ? cost / qty : null,
    costBasis: cost,
    realizedPnl: realized,
    totalFees: fees,
    firstBuyDate: firstBuy,
    lastTradeDate: sorted.length ? sorted[sorted.length - 1].date : null,
    errors,
  };
}

/** 통화 1단위당 원. KRW는 1 */
export function krwRate(currency: string, fx: Record<string, number>): number | null {
  if (currency === "KRW") return 1;
  const r = fx[currency];
  return r != null && r > 0 ? r : null;
}

export interface HoldingInput {
  stockId: number;
  name: string;
  industry: string | null;
  currency: string;
  tags: string[];
  quantity: number;
  avgCost: number | null;
  costBasis: number;
  price: number | null;
}

export interface HoldingRow extends HoldingInput {
  marketValue: number | null;
  marketValueKrw: number | null;
  /** 포트폴리오(현금 포함) 대비 % */
  weight: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  unrealizedPnlKrw: number | null;
  missing: ("price" | "fx")[];
}

export interface Exposure {
  key: string;
  valueKrw: number;
  weight: number;
}

export interface PortfolioSummary {
  rows: HoldingRow[];
  investedKrw: number;
  cashKrw: number;
  totalKrw: number;
  unrealizedKrw: number;
  byIndustry: Exposure[];
  byCurrency: Exposure[];
  byTag: Exposure[];
  warnings: { kind: "position" | "industry" | "missing"; message: string; stockId?: number }[];
}

export function buildPortfolio(input: {
  holdings: HoldingInput[];
  cash: { currency: string; amount: number }[];
  fx: Record<string, number>;
  maxPositionPct: number;
  maxIndustryPct: number;
}): PortfolioSummary {
  const warnings: PortfolioSummary["warnings"] = [];
  const rows: HoldingRow[] = input.holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const rate = krwRate(h.currency, input.fx);
      const missing: HoldingRow["missing"] = [];
      if (h.price == null) missing.push("price");
      if (rate == null) missing.push("fx");
      const marketValue = h.price != null ? h.price * h.quantity : null;
      const marketValueKrw = marketValue != null && rate != null ? marketValue * rate : null;
      const unrealizedPnl = marketValue != null ? marketValue - h.costBasis : null;
      return {
        ...h,
        marketValue,
        marketValueKrw,
        weight: null,
        unrealizedPnl,
        unrealizedPct: unrealizedPnl != null && h.costBasis > 0 ? unrealizedPnl / h.costBasis : null,
        unrealizedPnlKrw: unrealizedPnl != null && rate != null ? unrealizedPnl * rate : null,
        missing,
      };
    });

  let cashKrw = 0;
  for (const c of input.cash) {
    const rate = krwRate(c.currency, input.fx);
    if (rate == null) warnings.push({ kind: "missing", message: `${c.currency} 환율이 없어 현금 ${c.amount.toLocaleString("ko-KR")}을(를) 합계에서 뺐습니다.` });
    else cashKrw += c.amount * rate;
  }
  const investedKrw = rows.reduce((s, r) => s + (r.marketValueKrw ?? 0), 0);
  const totalKrw = investedKrw + cashKrw;
  const unrealizedKrw = rows.reduce((s, r) => s + (r.unrealizedPnlKrw ?? 0), 0);

  for (const r of rows) {
    r.weight = r.marketValueKrw != null && totalKrw > 0 ? (r.marketValueKrw / totalKrw) * 100 : null;
    if (r.missing.length) {
      warnings.push({
        kind: "missing",
        stockId: r.stockId,
        message: `${r.name}: ${r.missing.map((m) => (m === "price" ? "현재가" : `${r.currency} 환율`)).join("·")}이(가) 없어 평가액에서 뺐습니다.`,
      });
    }
    if (r.weight != null && r.weight > input.maxPositionPct) {
      warnings.push({ kind: "position", stockId: r.stockId, message: `${r.name} 비중 ${r.weight.toFixed(1)}%가 종목당 최대 ${input.maxPositionPct}%를 넘습니다.` });
    }
  }

  const group = (keyOf: (r: HoldingRow) => string[], extra: { key: string; valueKrw: number }[] = []): Exposure[] => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.marketValueKrw == null) continue;
      for (const k of keyOf(r)) m.set(k, (m.get(k) ?? 0) + r.marketValueKrw);
    }
    for (const e of extra) m.set(e.key, (m.get(e.key) ?? 0) + e.valueKrw);
    return [...m.entries()]
      .map(([key, valueKrw]) => ({ key, valueKrw, weight: totalKrw > 0 ? (valueKrw / totalKrw) * 100 : 0 }))
      .sort((a, b) => b.valueKrw - a.valueKrw);
  };

  const byIndustry = group((r) => [r.industry ?? "미지정"]);
  for (const e of byIndustry) {
    if (e.key !== "미지정" && e.weight > input.maxIndustryPct) {
      warnings.push({ kind: "industry", message: `산업 '${e.key}' 비중 ${e.weight.toFixed(1)}%가 산업당 최대 ${input.maxIndustryPct}%를 넘습니다.` });
    }
  }
  const cashByCurrency = input.cash
    .map((c) => ({ key: c.currency, valueKrw: c.amount * (krwRate(c.currency, input.fx) ?? 0) }))
    .filter((c) => c.valueKrw !== 0);
  const byCurrency = group((r) => [r.currency], cashByCurrency);
  const byTag = group((r) => (r.tags.length ? r.tags : ["(태그 없음)"]));

  return { rows, investedKrw, cashKrw, totalKrw, unrealizedKrw, byIndustry, byCurrency, byTag, warnings };
}
