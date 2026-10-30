import { describe, expect, it } from "vitest";
import { evaluateMove, nextStage, type GateContext } from "@/domain/pipeline";

const empty: GateContext = { hasValuation: false, memoComplete: false, memoConfirmed: false, hasRetrospective: false };
const ready: GateContext = { hasValuation: true, memoComplete: true, memoConfirmed: true, hasRetrospective: true };

describe("evaluateMove", () => {
  it("한 단계 전진은 게이트 없이 통과", () => {
    const ev = evaluateMove({ from: "idea", to: "filter" }, empty);
    expect(ev.errors).toEqual([]);
    expect(ev.gateFailures).toEqual([]);
  });

  it("뒤로 가는 이동은 자유", () => {
    const ev = evaluateMove({ from: "valuation", to: "idea" }, empty);
    expect(ev.errors).toEqual([]);
    expect(ev.gateFailures).toEqual([]);
  });

  it("같은 단계로는 이동할 수 없다", () => {
    expect(evaluateMove({ from: "idea", to: "idea" }, empty).errors).toHaveLength(1);
  });

  it("단계를 건너뛰면 우회 가능한 게이트 실패", () => {
    const ev = evaluateMove({ from: "idea", to: "analysis" }, empty);
    expect(ev.errors).toEqual([]);
    expect(ev.gateFailures.map((f) => f.code)).toEqual(["skip"]);
    expect(ev.gateFailures[0].message).toContain("1차 필터");
  });

  it("메모 → 매수 대기: 가치평가와 메모 필수", () => {
    const ev = evaluateMove({ from: "memo", to: "buy_wait" }, empty);
    expect(ev.gateFailures.map((f) => f.code)).toEqual(["no_valuation", "memo_incomplete"]);
    expect(evaluateMove({ from: "memo", to: "buy_wait" }, ready).gateFailures).toEqual([]);
  });

  it("메모가 완성됐지만 확정 안 됐으면 실패", () => {
    const ev = evaluateMove({ from: "memo", to: "buy_wait" }, { ...ready, memoConfirmed: false });
    expect(ev.gateFailures.map((f) => f.code)).toEqual(["memo_unconfirmed"]);
  });

  it("건너뛰며 메모 경계를 넘어도 메모 게이트를 점검", () => {
    const ev = evaluateMove({ from: "analysis", to: "holding" }, empty);
    expect(ev.gateFailures.map((f) => f.code)).toEqual(["skip", "no_valuation", "memo_incomplete"]);
  });

  it("매도는 매도 사유가 필수이며 우회 불가", () => {
    const ev = evaluateMove({ from: "holding", to: "sold" }, ready);
    expect(ev.requires.sellReason).toBe(true);
    expect(ev.errors).toHaveLength(1);
    expect(evaluateMove({ from: "holding", to: "sold", sellReasonType: "value_reached" }, ready).errors).toEqual([]);
  });

  it("기타 매도 사유는 서술 필수", () => {
    expect(evaluateMove({ from: "holding", to: "sold", sellReasonType: "other" }, ready).errors).toHaveLength(1);
    expect(
      evaluateMove({ from: "holding", to: "sold", sellReasonType: "other", sellReasonText: "세금" }, ready).errors,
    ).toEqual([]);
  });

  it("매도 → 복기 완료는 복기 작성 필요", () => {
    expect(evaluateMove({ from: "sold", to: "reviewed" }, empty).gateFailures.map((f) => f.code)).toEqual(["no_retrospective"]);
    expect(evaluateMove({ from: "sold", to: "reviewed" }, ready).gateFailures).toEqual([]);
  });

  it("탈락은 어디서든 가능하지만 사유 필수", () => {
    expect(evaluateMove({ from: "valuation", to: "rejected" }, empty).errors).toHaveLength(1);
    const ev = evaluateMove({ from: "valuation", to: "rejected", rejectReason: "해자 없음" }, empty);
    expect(ev.errors).toEqual([]);
    expect(ev.gateFailures).toEqual([]);
  });

  it("탈락에서 원래 단계로 복원은 자유, 그 이후로는 원래 단계 기준으로 판정", () => {
    const ctx = { ...empty, rejectedFromStage: "analysis" as const };
    expect(evaluateMove({ from: "rejected", to: "analysis" }, ctx).gateFailures).toEqual([]);
    expect(evaluateMove({ from: "rejected", to: "valuation" }, ctx).gateFailures).toEqual([]);
    expect(evaluateMove({ from: "rejected", to: "memo" }, ctx).gateFailures.map((f) => f.code)).toEqual(["skip"]);
  });
});

describe("nextStage", () => {
  it("다음 단계를 돌려준다", () => {
    expect(nextStage("idea")).toBe("filter");
    expect(nextStage("reviewed")).toBeNull();
    expect(nextStage("rejected")).toBeNull();
  });
});
