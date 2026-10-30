/**
 * 7·8단계 보유 점검·복기와 대시보드 집계 (순수 함수).
 */
import { z } from "zod";

// ── 7단계: 보유 점검 ───────────────────────────────────────────
export const THESIS_STATUS = { valid: "유효", weakened: "약화", broken: "훼손" } as const;
export type ThesisStatus = keyof typeof THESIS_STATUS;

export const DECISIONS = { hold: "유지", add: "추가 매수", trim: "일부 매도", exit: "전량 매도" } as const;
export type Decision = keyof typeof DECISIONS;

export const CATALYST_STATUS = { pending: "대기", happened: "발생", missed: "빗나감" } as const;
export type CatalystStatus = keyof typeof CATALYST_STATUS;

export const REVIEW_INTERVAL_DAYS = 100;

export const holdingReviewSchema = z.object({
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memoId: z.number().int().nullable(),
  theses: z.array(z.object({ thesis: z.string(), status: z.enum(["valid", "weakened", "broken"]), note: z.string().max(2000) })).max(10),
  conditions: z
    .array(
      z.object({
        description: z.string(),
        status: z.enum(["triggered", "clear", "manual", "insufficient"]),
        detail: z.string(),
        /** 사용자가 확인한 판단 (수동 확인 조건 포함) */
        userJudgement: z.enum(["triggered", "clear"]).nullable(),
      }),
    )
    .max(30),
  catalysts: z.array(z.object({ description: z.string(), expectedDate: z.string().nullable(), status: z.enum(["pending", "happened", "missed"]) })).max(30),
  decision: z.enum(["hold", "add", "trim", "exit"]),
  reason: z.string().trim().min(1, "결정 이유를 적으세요.").max(5000),
});
export type HoldingReviewInput = z.infer<typeof holdingReviewSchema>;

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.floor((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);

/**
 * 점검 필요 여부: 마지막 점검(없으면 보유 시작일) 이후 100일이 지났는가.
 */
export function reviewDue(lastReviewDate: string | null, holdingSince: string, today: string, interval = REVIEW_INTERVAL_DAYS) {
  const base = lastReviewDate ?? holdingSince;
  const elapsed = days(base, today);
  return { due: elapsed >= interval, elapsed, base, neverReviewed: !lastReviewDate };
}

/** 점검 결과 요약: 훼손된 논리나 충족된 매도 조건이 있으면 경고 */
export function reviewAlerts(r: Pick<HoldingReviewInput, "theses" | "conditions">): string[] {
  const out: string[] = [];
  const broken = r.theses.filter((t) => t.status === "broken").length;
  const weak = r.theses.filter((t) => t.status === "weakened").length;
  if (broken) out.push(`훼손된 핵심 논리 ${broken}개`);
  if (weak) out.push(`약화된 핵심 논리 ${weak}개`);
  const hit = r.conditions.filter((c) => (c.userJudgement ?? c.status) === "triggered").length;
  if (hit) out.push(`충족된 매도 조건 ${hit}개`);
  return out;
}

// ── 8단계: 복기 ────────────────────────────────────────────────
export const OUTCOMES = { gain: "수익", loss: "손실" } as const;
export const PROCESSES = { hit: "논리 적중", miss: "논리 빗나감" } as const;
export type Outcome = keyof typeof OUTCOMES;
export type Process = keyof typeof PROCESSES;

export const QUADRANTS = {
  skill: { label: "실력", outcome: "gain", process: "hit", help: "논리가 맞았고 돈도 벌었다" },
  luck: { label: "운", outcome: "gain", process: "miss", help: "논리는 틀렸는데 돈은 벌었다 — 반복할 수 없다" },
  bad_luck: { label: "불운", outcome: "loss", process: "hit", help: "논리는 맞았는데 돈을 잃었다 — 과정은 지킬 것" },
  mistake: { label: "실수", outcome: "loss", process: "miss", help: "논리도 틀렸고 돈도 잃었다 — 교훈을 남길 것" },
} as const;
export type Quadrant = keyof typeof QUADRANTS;

export function quadrantOf(outcome: Outcome, process: Process): Quadrant {
  if (outcome === "gain") return process === "hit" ? "skill" : "luck";
  return process === "hit" ? "bad_luck" : "mistake";
}

export const DEFAULT_MISTAKE_TAGS = [
  "경영진 과신",
  "사이클 정점 매수",
  "가정 과낙관",
  "너무 이른 매도",
  "너무 늦은 매도",
  "능력 범위 밖",
  "확증편향",
  "비중 과다",
  "밸류에이션 무시",
  "촉매 착각",
];

export const retrospectiveSchema = z.object({
  kind: z.enum(["final", "interim"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memoId: z.number().int().nullable(),
  outcome: z.enum(["gain", "loss"]),
  process: z.enum(["hit", "miss"]),
  returnPct: z.number().finite().nullable(),
  whatHappened: z.string().trim().min(1, "실제로 무슨 일이 있었는지 적으세요.").max(10000),
  thesisReview: z.string().max(10000),
  lessons: z.string().max(10000),
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
});
export type RetrospectiveInput = z.infer<typeof retrospectiveSchema>;

/** 매매 기록으로 수익률 제안: 실현손익(+ 보유분 평가손익) ÷ 총 매수 금액 */
export function suggestReturn(input: { totalBought: number; realizedPnl: number; unrealizedPnl: number | null }): number | null {
  if (!(input.totalBought > 0)) return null;
  return (input.realizedPnl + (input.unrealizedPnl ?? 0)) / input.totalBought;
}

// ── 대시보드 집계 ──────────────────────────────────────────────
export interface CatalystItem {
  stockId: number;
  stockName: string;
  description: string;
  expectedDate: string;
}

/** 다가오는 촉매: 앞으로 horizon일 + 지난 overdue일 이내 (지난 것은 '지남' 표시) */
export function upcomingCatalysts(items: CatalystItem[], today: string, horizon = 120, overdue = 60) {
  return items
    .map((i) => ({ ...i, daysUntil: days(today, i.expectedDate) }))
    .filter((i) => i.daysUntil <= horizon && i.daysUntil >= -overdue)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export function retroStats(retros: { outcome: Outcome; process: Process; tags: string[] }[]) {
  const quadrants: Record<Quadrant, number> = { skill: 0, luck: 0, bad_luck: 0, mistake: 0 };
  const tags = new Map<string, number>();
  for (const r of retros) {
    quadrants[quadrantOf(r.outcome, r.process)]++;
    for (const t of r.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  return {
    total: retros.length,
    quadrants,
    tags: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  };
}
