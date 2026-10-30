import { describe, expect, it } from "vitest";
import annual from "./fixtures/dart-samsung-2024-annual.json";
import q3 from "./fixtures/dart-samsung-2025-q3.json";
import {
  checkAuditOpinion,
  checkCapitalRaises,
  checkLargestHolderChange,
  checkNegativeOcf,
  commonSharesOutstanding,
  normalizeDartStatement,
  type DartAccountRow,
} from "@/integrations/dart/normalize";

const T = 1e12;

describe("normalizeDartStatement — 삼성전자 2024 사업보고서(연결)", () => {
  const { values, refs } = normalizeDartStatement(annual.list as DartAccountRow[], "annual");

  it("손익 계정", () => {
    expect(values.revenue).toBe(300870903000000);
    expect(values.operating_income).toBe(32725961000000);
    expect(values.net_income).toBe(34451351000000);
    expect(values.net_income_parent).toBe(33621363000000);
    expect(values.pretax_income).toBe(37529734000000);
    expect(refs.revenue).toBe("ifrs-full_Revenue");
  });

  it("현금성자산 = 현금및현금성자산 + 단기금융상품", () => {
    expect(values.cash).toBe(53705579000000 + 58909334000000);
  });

  it("표준계정코드 미사용 행(단기차입금)은 계정명으로 찾아 합산", () => {
    // 단기차입금 13.17조 + 유동성장기부채 2.21조
    expect(values.short_term_debt).toBe(13172504000000 + 2207290000000);
    expect(refs.short_term_debt).toContain("단기차입금");
    // 사채 + 장기차입금
    expect(values.long_term_debt).toBe(14530000000 + 3935860000000);
  });

  it("현금흐름 지출 계정은 부호와 무관하게 양수", () => {
    expect(values.capex).toBe(51406355000000 + 2335284000000);
    expect(values.dividends_paid).toBe(10888749000000);
    expect(values.buyback).toBe(1811775000000); // 원본은 음수
    expect(values.ocf).toBe(72982621000000);
  });

  it("자본·부채", () => {
    expect(values.total_equity).toBe(402192070000000);
    expect(values.equity_parent).toBe(391687603000000);
    expect(values.total_liabilities).toBe(112339878000000);
  });
});

describe("normalizeDartStatement — 분기보고서 누적 금액", () => {
  it("손익은 누적(thstrm_add_amount), 재무상태는 기말 금액", () => {
    const { values } = normalizeDartStatement(q3.list as DartAccountRow[], "cumulative");
    expect(values.operating_income).toBe(23527391000000); // 3분기 누적 (3개월은 12.17조)
    expect(values.total_assets).toBe(523659586000000);
    expect(values.revenue! / T).toBeGreaterThan(200);
  });

  it("2018년 이전 'ifrs_' 접두어 계정ID도 인식", () => {
    const rows: DartAccountRow[] = [
      { sj_div: "IS", account_id: "ifrs_Revenue", account_nm: "수익(매출액)", account_detail: "-", thstrm_amount: "239575376000000" },
      { sj_div: "CF", account_id: "ifrs_CashFlowsFromUsedInOperatingActivities", account_nm: "영업활동 현금흐름", account_detail: "-", thstrm_amount: "62162041000000" },
    ];
    const { values } = normalizeDartStatement(rows, "annual");
    expect(values.revenue).toBe(239575376000000);
    expect(values.ocf).toBe(62162041000000);
  });

  it("자본변동표 세부 행(account_detail)은 제외", () => {
    const rows: DartAccountRow[] = [
      { sj_div: "BS", account_id: "ifrs-full_Equity", account_nm: "자본총계", account_detail: "이익잉여금 [member]", thstrm_amount: "1" },
      { sj_div: "BS", account_id: "ifrs-full_Equity", account_nm: "자본총계", account_detail: "-", thstrm_amount: "100" },
    ];
    expect(normalizeDartStatement(rows, "annual").values.total_equity).toBe(100);
  });
});

describe("commonSharesOutstanding", () => {
  it("보통주 유통주식수", () => {
    expect(
      commonSharesOutstanding([
        { se: "보통주", distb_stock_co: "5,940,082,550" },
        { se: "우선주", distb_stock_co: "818,836,700" },
      ]),
    ).toBe(5940082550);
    expect(commonSharesOutstanding([{ se: "합계", distb_stock_co: "1" }])).toBeNull();
  });
});

describe("1차 필터 자동 체크", () => {
  const asOf = "2026-10-30";

  it("감사의견: '부적정'은 '적정'을 포함하지만 실패", () => {
    const ok = checkAuditOpinion(
      [
        { bsns_year: "제56기\n(당기)", adt_opinion: "적정의견", adtor: "삼정" },
        { bsns_year: "제56기\n(당기)", adt_opinion: "적정의견", adtor: "삼정" },
        { bsns_year: "제55기\n(전기)", adt_opinion: "적정", adtor: "삼정" },
        { bsns_year: "제55기\n(전기)", adtor: "-" },
      ],
      2024,
    );
    expect(ok.answer).toBe("yes");
    expect(ok.evidence).toContain("제56기 (당기) 적정의견");
    expect(checkAuditOpinion([{ bsns_year: "제1기(당기)", adt_opinion: "부적정" }], 2024).answer).toBe("no");
    expect(checkAuditOpinion([{ bsns_year: "제1기(당기)", adt_opinion: "한정의견" }], 2024).answer).toBe("no");
    expect(checkAuditOpinion([{ bsns_year: "제1기(당기)", adt_opinion: "의견거절" }], 2024).answer).toBe("no");
    expect(checkAuditOpinion([], 2024).answer).toBeNull();
  });

  it("자금조달: 3년 내 유상증자 + CB 회차 합계 2건 이상이면 실패, 정정공시 중복 제거", () => {
    const r = checkCapitalRaises(
      [
        { isu_dcrs_de: "2020.08.04", isu_dcrs_stle: "유상증자(제3자배정)" },
        { isu_dcrs_de: "2024.07.09", isu_dcrs_stle: "유상증자(제3자배정)" },
        { isu_dcrs_de: "2024.08.01", isu_dcrs_stle: "전환권행사" },
        { isu_dcrs_de: "-", isu_dcrs_stle: "-" },
      ],
      [
        { rcept_no: "20240709000462", bd_tm: "5", bd_fta: "7,000,000,000" },
        { rcept_no: "20240801000001", bd_tm: "5", bd_fta: "7,000,000,000" }, // 같은 회차 정정
        { rcept_no: "20220101000001", bd_tm: "3" }, // 3년 이전
      ],
      [],
      asOf,
    );
    expect(r.answer).toBe("no");
    expect(r.evidence).toContain("2건");
    expect(r.evidence).toContain("CB 5회차");
    expect(r.evidence).not.toContain("전환권행사");

    const once = checkCapitalRaises([{ isu_dcrs_de: "2025.01.10", isu_dcrs_stle: "유상증자(주주배정)" }], [], [], asOf);
    expect(once.answer).toBe("yes");
    expect(checkCapitalRaises([], [], [], asOf).evidence).toContain("없음");
  });

  it("최대주주 변동: 3년 내 변동일이 있으면 실패", () => {
    const rows = [
      { change_on: "2017년 12월 08일", mxmm_shrholdr_nm: "(주)에이젠생명과학", change_cause: "경영권 양수도" },
      { change_on: "2025년 12월 30일", mxmm_shrholdr_nm: "(주)씨아이테크", change_cause: "제3자배정" },
    ];
    expect(checkLargestHolderChange(rows, asOf).answer).toBe("no");
    const old = checkLargestHolderChange(rows.slice(0, 1), asOf);
    expect(old.answer).toBe("yes");
    expect(old.evidence).toContain("2017-12-08");
    expect(checkLargestHolderChange([{ change_on: "-", mxmm_shrholdr_nm: "-" }], asOf).evidence).toBe("최대주주 변동 기록 없음");
  });

  it("영업현금흐름: 최근 2년 연속 음수면 실패", () => {
    expect(checkNegativeOcf([{ year: 2023, value: 5e9 }, { year: 2024, value: -1e9 }, { year: 2025, value: -2e9 }], "KRW").answer).toBe("no");
    expect(checkNegativeOcf([{ year: 2024, value: -1e9 }, { year: 2025, value: 3e9 }], "KRW").answer).toBe("yes");
    expect(checkNegativeOcf([{ year: 2025, value: 3e9 }], "USD").answer).toBeNull();
    expect(checkNegativeOcf([{ year: 2024, value: 1e9 }, { year: 2025, value: 2e9 }], "USD").evidence).toContain("$2B");
  });
});
