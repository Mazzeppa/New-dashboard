/**
 * 종목 파이프라인: 단계 정의, 이동 규칙, 게이트 판정.
 * UI·DB와 무관한 순수 함수만 둔다.
 */

export const PIPELINE_STAGES = [
  "idea",
  "filter",
  "analysis",
  "valuation",
  "memo",
  "buy_wait",
  "holding",
  "sold",
  "reviewed",
] as const;

export const STAGES = [...PIPELINE_STAGES, "rejected"] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  idea: "아이디어",
  filter: "1차 필터",
  analysis: "심층 분석",
  valuation: "가치평가",
  memo: "투자 메모",
  buy_wait: "매수 대기",
  holding: "보유",
  sold: "매도",
  reviewed: "복기 완료",
  rejected: "탈락",
};

export const SELL_REASONS = {
  thesis_broken: "논리 훼손",
  value_reached: "가치 도달",
  better_opportunity: "기회 교체",
  other: "기타",
} as const;
export type SellReasonType = keyof typeof SELL_REASONS;

/** 신규 등록 시 시작할 수 있는 단계 (기존 보유 종목은 바로 '보유'로 등록 가능) */
export const INITIAL_STAGES: PipelineStage[] = ["idea", "holding"];

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

export function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

export function nextStage(stage: Stage): PipelineStage | null {
  if (stage === "rejected") return null;
  const i = stageIndex(stage);
  return i < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[i + 1] : null;
}

/** 게이트 판정에 필요한 종목 상태. DB에서 조회해 채운다. */
export interface GateContext {
  hasValuation: boolean;
  memoComplete: boolean;
  memoConfirmed: boolean;
  hasRetrospective: boolean;
  /** 탈락 상태에서 복원할 때 원래 단계 */
  rejectedFromStage?: PipelineStage | null;
}

export interface MoveInput {
  from: Stage;
  to: Stage;
  rejectReason?: string;
  sellReasonType?: SellReasonType;
  sellReasonText?: string;
}

export interface GateFailure {
  code: string;
  message: string;
}

export interface MoveEvaluation {
  /** 우회할 수 없는 오류 (입력 누락 등). 있으면 이동 불가 */
  errors: string[];
  /** 게이트 실패. 우회 사유를 입력하면 진행할 수 있다 */
  gateFailures: GateFailure[];
  /** 이 이동에 필요한 추가 입력 */
  requires: { rejectReason: boolean; sellReason: boolean };
}

/**
 * 단계 이동을 평가한다.
 * - 뒤로 가는 이동은 자유
 * - 앞으로 한 단계씩 이동, 건너뛰면 게이트 실패(우회 가능)
 * - 투자 메모 → 매수 대기 경계를 넘으면 가치평가·메모 조건 점검
 * - 매도로 가려면 매도 사유 필수(우회 불가)
 * - 매도 → 복기 완료 경계를 넘으면 복기 작성 여부 점검
 * - 탈락은 어느 단계에서든 가능, 사유 필수
 */
export function evaluateMove(input: MoveInput, ctx: GateContext): MoveEvaluation {
  const { from, to } = input;
  const errors: string[] = [];
  const gateFailures: GateFailure[] = [];
  const requires = { rejectReason: to === "rejected", sellReason: to === "sold" };

  if (from === to) {
    errors.push("이미 해당 단계에 있습니다.");
    return { errors, gateFailures, requires };
  }

  if (to === "rejected") {
    if (!input.rejectReason?.trim()) errors.push("탈락 사유를 입력하세요.");
    return { errors, gateFailures, requires };
  }

  if (to === "sold") {
    if (!input.sellReasonType || !(input.sellReasonType in SELL_REASONS)) {
      errors.push("매도 사유를 선택하세요.");
    } else if (input.sellReasonType === "other" && !input.sellReasonText?.trim()) {
      errors.push("기타 매도 사유를 서술하세요.");
    }
  }

  // 탈락에서 복원: 원래 단계(또는 그 이전)로는 자유, 그 이후로는 아래 규칙을 원래 단계 기준으로 적용
  const effectiveFrom: PipelineStage =
    from === "rejected" ? (ctx.rejectedFromStage ?? "idea") : from;

  const fi = stageIndex(effectiveFrom);
  const ti = stageIndex(to);

  if (ti <= fi) return { errors, gateFailures, requires };

  if (ti - fi > 1) {
    const skipped = PIPELINE_STAGES.slice(fi + 1, ti).map((s) => STAGE_LABELS[s]);
    gateFailures.push({
      code: "skip",
      message: `단계를 건너뜁니다: ${skipped.join(", ")}`,
    });
  }

  const crosses = (a: PipelineStage, b: PipelineStage) =>
    fi <= stageIndex(a) && ti >= stageIndex(b);

  if (crosses("memo", "buy_wait")) {
    if (!ctx.hasValuation)
      gateFailures.push({ code: "no_valuation", message: "가치평가 결과가 없습니다." });
    if (!ctx.memoComplete)
      gateFailures.push({ code: "memo_incomplete", message: "투자 메모 필수 항목이 비어 있습니다." });
    else if (!ctx.memoConfirmed)
      gateFailures.push({ code: "memo_unconfirmed", message: "투자 메모가 확정(스냅샷)되지 않았습니다." });
  }

  if (crosses("sold", "reviewed") && !ctx.hasRetrospective) {
    gateFailures.push({ code: "no_retrospective", message: "복기가 작성되지 않았습니다." });
  }

  return { errors, gateFailures, requires };
}
