/**
 * 6단계 비중 도우미 (순수 함수). 비중은 포트폴리오 대비 %로 다룬다(15 = 15%).
 */
import type { ConvictionBand } from "./principles";

export interface CapResult {
  /** 허용 최대 손실 ÷ 비관 하락률 (하락률이 0 이하이거나 모르면 null) */
  lossCap: number | null;
  /** 실제 상한 = min(lossCap, 종목당 최대 비중) */
  cap: number;
  basis: string;
}

/**
 * 비중 상한 = 종목당 허용 최대 손실(%) ÷ 비관 시나리오 하락률.
 * 하락률이 0 이하(비관 가치 ≥ 현재가)이거나 알 수 없으면 원칙의 종목당 최대 비중을 상한으로 쓴다.
 * 손실 기준 상한이 종목당 최대 비중보다 크면 종목당 최대 비중이 상한이다.
 */
export function positionCap(maxLossPct: number, maxPositionPct: number, bearDownside: number | null): CapResult {
  if (bearDownside == null) {
    return { lossCap: null, cap: maxPositionPct, basis: `비관 하락률을 알 수 없어 종목당 최대 비중 ${maxPositionPct}%를 상한으로 씀` };
  }
  if (bearDownside <= 0) {
    return { lossCap: null, cap: maxPositionPct, basis: `비관 가치가 현재가 이상(하락률 ${round(bearDownside * 100)}%)이라 종목당 최대 비중 ${maxPositionPct}%를 상한으로 씀` };
  }
  const lossCap = maxLossPct / bearDownside;
  const cap = Math.min(lossCap, maxPositionPct);
  const basis =
    lossCap <= maxPositionPct
      ? `최대 손실 ${maxLossPct}% ÷ 비관 하락률 ${round(bearDownside * 100)}% = ${round(lossCap)}%`
      : `손실 기준 ${round(lossCap)}%가 종목당 최대 비중 ${maxPositionPct}%보다 커서 ${maxPositionPct}%로 제한`;
  return { lossCap, cap, basis };
}

/** 확신도에 따른 권장 범위 = 상한 × 밴드 비율 */
export function recommendedRange(cap: number, conviction: number | null, bands: ConvictionBand[]): { min: number; max: number } | null {
  if (conviction == null) return null;
  const band = bands.find((b) => b.level === conviction);
  if (!band) return null;
  return { min: (cap * band.minPct) / 100, max: (cap * band.maxPct) / 100 };
}

export interface SizingCheckInput {
  /** 이 종목의 목표 비중 (%) */
  targetPct: number;
  cap: CapResult;
  maxPositionPct: number;
  range: { min: number; max: number } | null;
  /** 이 종목을 목표 비중으로 맞춘 뒤 같은 산업의 합계 비중 (%) */
  industryPctAfter: number | null;
  maxIndustryPct: number;
  industry: string | null;
  /** 능력의 범위 목록 */
  circleOfCompetence: string[];
}

export function sizingWarnings(i: SizingCheckInput): string[] {
  const w: string[] = [];
  if (i.targetPct > i.maxPositionPct) w.push(`종목당 최대 비중 ${i.maxPositionPct}%를 넘습니다 (${round(i.targetPct)}%).`);
  if (i.cap.lossCap != null && i.targetPct > i.cap.lossCap) {
    w.push(`비관 시나리오가 오면 포트폴리오 손실이 허용 한도를 넘습니다 (손실 기준 상한 ${round(i.cap.lossCap)}%).`);
  }
  if (i.range && i.targetPct > i.range.max + 1e-9) w.push(`확신도 권장 범위(${round(i.range.min)}~${round(i.range.max)}%)보다 큽니다.`);
  if (i.industryPctAfter != null && i.industryPctAfter > i.maxIndustryPct) {
    w.push(`산업(${i.industry ?? "미지정"}) 합계 ${round(i.industryPctAfter)}%가 산업당 최대 비중 ${i.maxIndustryPct}%를 넘습니다.`);
  }
  if (!i.industry) w.push("산업이 지정되지 않아 산업 한도를 점검할 수 없습니다.");
  else if (i.circleOfCompetence.length && !i.circleOfCompetence.includes(i.industry)) w.push(`'${i.industry}'은(는) 능력의 범위 밖입니다.`);
  return w;
}

function round(n: number, d = 1) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
