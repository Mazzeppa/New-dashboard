# CLAUDE.md

개인용 가치투자 프로세스 관리 웹앱. 종목이 0~8단계(아이디어 → 복기)를 차례로 통과하게 하고, 각 단계의 판단을 기록으로 남긴다. 단일 사용자, 로컬 실행 전용(인증 없음). 자동매매·주문 기능은 만들지 않는다.

## 명령어

```bash
npm install          # 의존성 설치
cp .env.example .env # 환경변수 (API 키는 서버 측에서만 사용)
npm run dev          # 개발 서버 (http://localhost:3000). 첫 요청 때 DB 마이그레이션·시드 자동 적용
npm test             # Vitest 단위 테스트 (tests/)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # 프로덕션 빌드 (타입·린트 포함)
npm run db:generate  # schema.ts 변경 후 마이그레이션 SQL 생성 (drizzle/)
npm run db:studio    # Drizzle Studio로 DB 열람
```

스키마를 바꾸면 반드시 `npm run db:generate`로 마이그레이션을 만들고 `drizzle/`를 함께 커밋한다. 앱은 시작 시 `migrate()`로 자동 적용한다.

## 구조

```
src/
  app/                  # App Router 페이지
    actions/            # Server Actions ("use server"). 모든 데이터 변경은 여기서
    api/candidates/     # POST: 외부 후보 일괄 등록 (스크리너 연결 진입점)
    api/memos/[id]/markdown/ # GET: 투자 메모 마크다운 내보내기
    api/backup/         # GET: 전체 JSON 백업, POST: 복원
    api/export/[kind]/  # GET: CSV 내보내기 (stocks, trades, portfolio, retrospectives, financials)
    portfolio/          # 포트폴리오 화면
  components/
    ui/                 # 공용 UI (Button, Input, Card, Dialog 등. 자체 구현, 외부 UI 키트 없음)
    pipeline/           # 칸반 보드, useStageMove (단계 이동 + 게이트 다이얼로그)
    analysis/           # 심층 분석 탭(비재무 섹션 편집기, 재무 그리드·붙여넣기), 종목 체크리스트
    valuation/          # 가치평가 작업 화면, football field, 숫자 입력(NumberField)
    memo/               # 투자 메모 편집·확정·버전, 매도 조건 빌더
    trades/             # 매매·비중 탭 (비중 도우미, 포지션, 매매 기록)
    portfolio/          # 노출도 막대, 환율·현금 입력
    reviews/            # 보유 점검 탭 (논리 상태, 매도 조건 자동 평가, 결정)
    retro/              # 복기 탭 (스냅샷 vs 실제 비교, 2×2, 실수 태그, 교훈 반영)
    stocks/ principles/ settings/
  db/
    schema.ts           # Drizzle 스키마 (단일 진실 공급원)
    index.ts            # better-sqlite3 연결(첫 사용 시 지연 연결), 자동 마이그레이션·시드 (server-only)
    queries.ts          # 읽기 쿼리 (server-only)
    seed.ts             # 기본 원칙, 1차 필터 기본 항목, 필립 피셔 15 템플릿
  domain/               # ★ 순수 함수. DB·UI를 모름. Vitest 대상
    pipeline.ts         # 단계 정의, evaluateMove (게이트 판정)
    format.ts           # 억원/조원, $M/$B, 숫자 파싱
    stock.ts            # 시장·발굴경로 상수, candidateSchema (CSV·API 공용 검증)
    principles.ts       # 원칙 스키마, 기본값, diff
    analysis.ts         # 비재무 분석 탭의 질문 정의(필드 목록), 답 정리, 완성도
    financials.ts       # 표준 재무 계정, 단위, 기간·숫자 파싱, 표 붙여넣기 해석
    checklist.ts        # 필립 피셔 15 시드, 점수 요약
    metrics.ts          # 재무 지표(이익률, FCF, ROE, ROIC, 부채비율, NWC), 요약, 누적→분기 변환
    valuation.ts        # DCF·PER·EV/EBIT·자산가치, 시나리오 가중, 역DCF(이분법), 민감도, 입력 제안
    memo.ts             # 메모 스키마, 필수 항목 점검, 매도 조건 구조, 스냅샷, 마크다운
    sizing.ts           # 비중 상한(손실 기준), 확신도 권장 범위, 한도 경고
    portfolio.ts        # 매매 → 포지션(이동평균), 포트폴리오 원화 환산·비중·노출도·경고
    sell-conditions.ts  # 구조화된 매도 조건 자동 평가 (최근 N개 연속 기간)
    review.ts           # 보유 점검·복기 스키마, 점검 주기, 2×2 분류, 촉매 일정, 복기 통계
    csv.ts              # CSV 생성 (BOM, 이스케이프)
  integrations/
    price/normalize.ts  # (순수) 네이버·Yahoo 시세 응답 해석, Yahoo 심볼 규칙
    price/index.ts      # (server-only) PriceProvider, 네이버·Yahoo 조회, 통화 검증
    dart/normalize.ts   # (순수) DART 계정 매핑, 1차 필터 자동 체크 판정
    dart/client.ts      # (server-only) DART API 호출, 고유번호 캐시, 재무제표·체크 수집
    sec/normalize.ts    # (순수) companyfacts → 연간·분기 값, us-gaap 태그 매핑
    sec/client.ts       # (server-only) 티커→CIK 캐시, companyfacts 호출
  lib/
    action.ts           # ActionResult 타입, 헬퍼 (클라이언트에서도 import 가능)
    server/candidates.ts# 후보 일괄 등록 로직 (CSV 액션과 API 라우트 공용)
    server/financial-fetch.ts # API 수집 → financial_values 저장 정책, 수집 기록
    server/backup.ts    # 전체 백업·복원 (테이블 목록, 스키마 버전 확인)
    server/price-refresh.ts # 현재가·환율 갱신, 하루 1회 자동 갱신 판단
    pool.ts             # 동시 실행 제한
tests/                  # domain/*, integrations/*/normalize 단위 테스트
  fixtures/             # 실제 DART(삼성전자)·SEC(Apple)·네이버·Yahoo 응답을 줄인 것
drizzle/                # 마이그레이션 SQL
data/                   # SQLite 파일 (git 제외)
```

## 설계 결정

- **스택**: Next.js 15 App Router + TypeScript + Tailwind v4, SQLite(better-sqlite3, 동기) + Drizzle, zod v4, @dnd-kit, Recharts, Vitest.
- **계산·규칙은 `src/domain/`의 순수 함수**로만 만든다. Server Action과 화면은 호출만 한다. 새 계산(재무비율, DCF, 역DCF, 사이징)도 여기에 두고 테스트를 함께 쓴다.
- **데이터 변경은 Server Actions**, 외부 연동만 Route Handler. 변경 후 `revalidatePath("/", "layout")`.
- **저장 형식**: 시각은 ISO 문자열, 날짜는 `YYYY-MM-DD` 문자열. 금액은 원 단위(1원, 1달러) REAL과 통화 코드를 함께 둔다. 억원·$M 변환은 `domain/format.ts`에서 표시할 때만 한다.
- **원칙(0단계)**: `principles`(id=1, 현재본) + `principle_versions`(모든 버전 스냅샷과 변경 사유). 저장할 때마다 새 버전을 만들고, 변경 사유는 필수다. 서술형 원칙은 `rules[]`에 두며, 복기의 교훈이 여기로 들어온다.
- **파이프라인 이동 규칙** (`evaluateMove`):
  - 뒤로 가는 이동은 자유. 앞으로는 한 단계씩 이동하고, 건너뛰면 게이트 실패(우회 가능)로 처리한다.
  - 투자 메모 → 매수 대기 경계를 넘으면 가치평가 결과, 메모 필수 항목, 메모 확정을 점검한다.
  - 매도 → 복기 완료 경계를 넘으면 복기 작성 여부를 점검한다.
  - 매도로 이동할 때는 매도 사유가 필수이고, 탈락할 때는 탈락 사유가 필수다. 이 둘은 우회할 수 없다.
  - 신규 등록은 '아이디어' 또는 '보유'(기존 보유 종목)로 시작한다.
- **게이트 우회**: 실패한 게이트 목록과 우회 사유를 `stage_transitions`에 남긴다. 대시보드와 복기 화면에 표시한다.
- **게이트 컨텍스트**: `db/queries.ts`의 `getGateContext()`가 가치평가 결과(`hasValuation`), 메모 완성·확정(`memoComplete`, `memoConfirmed`), final 복기(`hasRetrospective`)를 DB에서 읽어 `evaluateMove`에 넘긴다. 새 게이트 조건을 추가하면 이 함수와 `GateContext` 타입을 함께 고친다.
- **탈락**: `stocks.rejectedFromStage`와 `rejectReason`. 복원하면 원래 단계로 돌아간다.
- **1차 필터 항목**: 기록이 남은 항목은 삭제하지 않고 비활성화한다(과거 판단 보존). `autoKey`는 DART 자동 체크 연결용이다. `origin='lesson'`은 복기 교훈에서 온 항목이다.
- **DB 연결은 지연 연결**: `db`는 Proxy이고 첫 쿼리 때 연결·마이그레이션한다. 모듈 최상위에서 쿼리 빌더를 호출하지 않는다(서브쿼리도 함수로 감싼다). `next build`가 여러 워커에서 모듈을 import할 때 마이그레이션이 경쟁해 빌드가 깨지기 때문이다.
- **심층 분석(비재무)**: 질문은 `domain/analysis.ts`의 `ANALYSIS_SECTIONS`에 필드 목록으로 정의하고, 화면은 이를 그대로 렌더링한다. 답은 `analysis_sections.answers` JSON(종목·탭당 한 행)과 1~5점 `score`로 저장한다. 질문을 추가하려면 정의만 바꾸면 된다(`sanitizeAnswers`가 정의 밖 키를 버린다).
- **재무 데이터**: `financial_values` 긴 형식(종목, 회계연도, 분기(0=연간), 계정 키, 값, 출처, sourceRef, 연결 여부). 계정 키는 `domain/financials.ts`의 `METRICS`. 값은 원 단위로 저장하고, 입력·표시 단위(억원, $M 등)는 화면에서만 곱하고 나눈다. 주식 수 계정은 단위를 곱하지 않는다. 사용자가 셀을 고치면 출처는 `manual`이 된다. 붙여넣기는 출처를 `report`나 `manual`로 고를 수 있다. API 수집분은 `dart`/`sec`(3단계에서 추가).
- **기간 헤더 "2023/12"**: 연간(결산월)인지 분기인지 자료마다 다르므로 붙여넣기 화면에서 고른다. △, ▲, (1,234)는 음수로 읽는다.
- **체크리스트 템플릿**: `checklist_templates` → `checklist_template_items` → 종목 적용 `stock_checklists` → `checklist_answers`(1~5점 + 메모). 질문은 "예"가 좋은 방향이 되도록 쓴다(피셔 13·14번은 그렇게 바꿔 적고 원문은 도움말에 남겼다). 평가에 쓰인 질문은 삭제할 수 없고 비활성화만 한다. 종목에 적용된 템플릿도 삭제할 수 없다.
- **외부 데이터 수집 (3단계)**:
  - 한국은 DART, 미국은 SEC EDGAR를 쓰고, 기타 시장은 수동 입력이나 붙여넣기를 쓴다. 수집은 연간 10년과 최근 12개 분기다.
  - 응답 정규화(`normalize.ts`)는 순수 함수로 두고, 실제 응답을 줄인 fixture로 테스트한다. 네트워크 호출(`client.ts`)과 분리한다.
  - **저장 정책**: API 값은 `source=dart|sec`, `sourceRef`(보고서·계정ID 또는 us-gaap 태그), `consolidated`와 함께 저장한다. 사용자가 직접 넣은 값(`manual`·`report`)은 "덮어쓰기"를 체크하지 않으면 유지한다. 같은 값을 다시 받으면 '변화 없음'으로 센다.
  - 수집할 때마다 `fetch_logs`에 남긴다(성공·실패, 연도·분기, 찾지 못한 계정).
- **DART**:
  - 고유번호: `corpCode.xml`(zip)을 받아 상장사만 `dart_corps`에 캐시하고 30일마다 갱신한다. 종목코드로 찾고, 없으면 정확한 종목명으로 찾는다.
  - 재무제표: `fnlttSinglAcntAll`로 사업연도마다 사업보고서의 당기 금액(최초 보고치)을 쓴다. 보고서마다 연결(CFS)을 먼저 시도하고, 없으면 별도(OFS)를 쓴다.
  - 계정 매핑은 `DART_MAPPING`이다. IFRS 계정ID를 우선하고, "-표준계정코드 미사용-" 행은 계정명으로 찾는다. 2018년 이전 보고서의 `ifrs_` 접두어는 `ifrs-full_`로 맞춘다.
  - 현금흐름표의 CAPEX·배당·자사주는 회사마다 부호가 달라 절댓값으로 저장한다.
  - 현금성자산은 현금및현금성자산 + 단기금융상품이다. 차입부채에는 리스부채를 포함한다.
  - 감가상각비와 이자비용은 이 API로 구할 수 없는 경우가 많아 직접 입력한다.
  - 분기: 1분기·반기·3분기 보고서의 손익은 누적 금액(`thstrm_add_amount`)을, 현금흐름은 원래 누적인 금액을 쓴다. `quarterlyFromCumulative`로 분기 단독 값을 만든다(4분기 = 연간 − 3분기 누적). 재무상태표 계정은 각 보고서의 기말 값이다.
  - 유통주식수는 `stockTotqySttus`의 보통주 `distb_stock_co`다(자기주식 제외, 액면분할 전 연도는 분할 전 주식 수).
- **SEC**:
  - `company_tickers.json`을 `sec_tickers`에 캐시하고, `companyfacts`의 us-gaap 태그를 쓴다. 회계연도는 10-K 연간 사실(350~380일)로 정하고, 표시 연도는 결산일의 연도다(예: Apple FY2026 1분기 = 2025년 10~12월).
  - 같은 계정도 시기마다 태그가 달라(Revenues → RevenueFromContract…) 기간마다 태그 우선순위를 적용한다. 같은 기간 값이 여러 번 보고되면 가장 먼저 제출된 값을 쓴다.
  - 분기 값은 3개월 값을 우선하고, 없으면 YTD 차이로 구한다. 유통주식수는 표지(dei)의 기준일 직전 기간에 붙인다.
  - 외국 기업(20-F, IFRS)은 지원하지 않는다. SEC는 API 키가 없고 `SEC_USER_AGENT`(이름 이메일)만 필요하다.
- **1차 필터 자동 체크** (`runFilterAutoChecks`):
  - 결과는 `autoAnswer`/`autoEvidence`에만 저장한다. 사용자가 "확인하고 적용"을 눌러야 답으로 확정된다.
  - 감사의견: 최근 사업보고서의 당기·전기·전전기 의견이 모두 '적정'이어야 통과한다. '부적정'이 '적정'을 포함하므로 한정·부적정·거절을 먼저 거른다.
  - 증자: 최근 3년 안의 유상증자(정기보고서 증자 현황의 발행일)와 CB·BW 발행결정(주요사항보고서, 회차 기준으로 정정공시 중복 제거)을 합쳐 2건 이상이면 '반복'으로 보고 실패 처리한다.
  - 최대주주: 최근 정기보고서의 변동 이력에 3년 안의 변동일이 있으면 실패다.
  - 영업현금흐름: 저장된 연간 OCF 중 최근 2년이 모두 음수면 실패다. 시장과 관계없이 적용한다.
- **재무 지표** (`computeMetrics`):
  - ROE = 지배주주순이익 ÷ 평균 지배주주지분.
  - ROIC = 영업이익 × (1 − 실효세율) ÷ 평균 투하자본. 투하자본 = 자본총계 + 차입부채 − 현금성자산. 실효세율이 0~50%를 벗어나면 25%를 쓴다.
  - 분기 ROE·ROIC는 4를 곱해 연환산한다. 평균은 직전 기간이 있을 때만 기초·기말 평균을 쓴다.
  - 부채비율 = 부채총계 ÷ 자본총계.
  - NWC = (유동자산 − 현금성자산) − (유동부채 − 단기차입부채).
  - 유지 CAPEX = CAPEX × 종목별 `maintenanceCapexPct`. 사용자가 입력한다.
- **차트**: Recharts를 쓰고, 같은 단위끼리 한 차트로 묶는다(이중 축 금지). 계열색은 `--series-1..3` 토큰(라이트·다크 각각 검증)이다. 아래 지표 표가 차트의 표 보기 역할을 한다.
- **클라우드 컨테이너에서 실행할 때**: Node 내장 fetch는 프록시 환경변수를 읽지 않으므로 `NODE_USE_ENV_PROXY=1 npm run dev`로 실행한다. 로컬 PC에서는 필요 없다. 이 컨테이너에서는 DART 다운로드가 느리다(corpCode 약 4분).
- **가치평가 (4단계)**:
  - `valuations` 테이블에 종목당 작업본 하나를 둔다. `data`는 `valuationDataSchema` JSON이다.
    - 공통 입력: 희석 주식 수, 순현금(순부채면 음수).
    - 대표 방법과 시나리오 확률(합계 100%).
    - 방법별(dcf/per/ev_ebit/nav) × 시나리오별(bear/base/bull) 가정, 근거 메모.
    - 확정 결과는 5단계 메모 스냅샷이 고정한다.
  - 비율은 소수로 저장한다(0.09 = 9%). 화면의 `NumberField`가 % 입력과 억원·$M 단위를 `scale`로 변환한다.
  - DCF: 1~N년 OE₀(1+g)^t를 할인하고, 잔존가치 OE_N(1+g_t)/(r−g_t)를 더한다. 주주가치 = 기업가치 + 순현금. r ≤ g_t이면 계산하지 않는다.
  - PER은 정상화 순이익 × PER = 주주가치다. EV/EBIT은 정상화 EBIT × 배수 = 기업가치에 순현금을 더한다. 자산가치는 장부 순자산 + 조정 항목(라벨·금액 목록)이다.
  - 내재가치 = 대표 방법의 시나리오별 주당 가치를 확률로 가중 평균한 값이다. 확률이 0보다 큰 시나리오가 하나라도 계산되지 않으면 내재가치를 내지 않고 이유를 보여 준다.
  - 안전마진 = 1 − 현재가/내재가치, 상승여력 = 내재가치/현재가 − 1이다.
  - 비관 하락률 = 1 − 비관 가치/현재가이며, 6단계 비중 상한에 쓴다.
  - 역DCF: DCF 기본 시나리오에서 성장률만 바꿔 주당 가치가 현재가와 같아지는 g를 이분법으로 찾는다(구간 −50%~100%, 허용오차 1e-7). 구간 밖이면 이유를 보여 준다.
  - 민감도 표는 기본 시나리오의 할인율 ±2%p × 성장률 ±4%p 격자다.
  - **입력 제안**(`suggestInputs`): 버튼을 눌러야 채워진다.
    - 소유주 이익 = 최근 연도 지배주주순이익 + 감가상각비 − 유지 CAPEX. 감가상각비가 없으면 영업현금흐름 − 유지 CAPEX로 대신하고, 유지 CAPEX 비율이 없으면 CAPEX 전액을 쓴다.
    - 정상화 이익·EBIT = 최근 5년 평균.
    - 순현금·주식 수·순자산 = 가장 최근 기간 값. 순현금은 현금성자산이 있는 한 기간에서만 계산해 시점을 섞지 않는다.
  - 게이트: `getGateContext().hasValuation` = 대표 방법의 기본 시나리오가 계산되는가(`hasValuationResult`).
  - football field는 차트 라이브러리 없이 HTML로 그린다(범위 막대 + 기본 시나리오 눈금 + 현재가·내재가치 기준선 + 호버 툴팁). 아래 방법×시나리오 표가 표 보기 역할을 한다.
- **투자 메모 (5단계)**:
  - `memos` 테이블에 버전별로 저장한다(`version`, `status` draft|confirmed, `content`, `snapshot`, `revisionReason`). 작성 중(draft)인 버전은 최신 하나뿐이다.
  - **확정**하면 필수 항목을 검증한다(`memoMissing`). 핵심 논리 1~3개, 시장이 잘못 보는 점, 예상 시점이 있는 촉매, 프리모템, 매도 조건이 필요하다. 빈 항목은 정리해서 저장한다(`cleanMemo`).
  - 확정할 때 그 시점의 가치평가 data와 계산 결과(내재가치, 안전마진, 비관 하락률, 방법×시나리오 격자), 현재가, 메모 내용을 `snapshot`으로 고정한다(`buildSnapshot`, 깊은 복사).
  - 확정본은 고칠 수 없다. "새 버전으로 수정"(사유 필수)이 확정본 내용을 복사해 다음 버전 draft를 만든다. 원본은 복기 비교용으로 남고, 새 draft는 버릴 수 있다.
  - 게이트: 확정본이 하나라도 있으면 `memoConfirmed`와 `memoComplete`가 참이다. 확정본이 없으면 작성 중인 버전의 완성도를 본다.
  - 매도 조건은 구조화형(지표 + 연산자 + 기준값 + 연속 기간 수 + 분기/연)과 서술형이 있다. 지표 목록은 `SELL_METRICS`이고, 7단계에서 자동 평가한다. 기준값은 비율이면 소수, 금액이면 원 단위로 저장한다.
  - 촉매는 메모 content JSON 안에 있다(예상 시점 YYYY-MM-DD). 대시보드 일정은 여기서 읽는다.
  - 마크다운은 `GET /api/memos/[id]/markdown`으로 내보낸다.
- **비중 (6단계)**:
  - 손실 기준 상한 = 종목당 최대 손실(%) ÷ 비관 하락률이다. 실제 상한은 이 값과 종목당 최대 비중 중 작은 값이다. 하락률이 0 이하이거나 모르면 종목당 최대 비중을 쓴다.
  - 권장 범위 = 상한 × 확신도 밴드다.
  - 경고: 종목 한도·손실 기준·권장 범위·산업 한도(같은 산업 다른 종목 비중 + 목표 비중)를 넘을 때, 그리고 능력의 범위 밖일 때 낸다.
  - 비중 결정은 `position_plans`에 당시 상한·범위·경고와 함께 기록한다. 경고가 있으면 메모(사유)가 필수다.
- **매매·포트폴리오**:
  - `trades`의 통화는 종목의 거래 통화로 고정한다.
  - 평균단가는 이동평균법이고, 매수 수수료는 원가에 넣고 매도 수수료는 실현손익에서 뺀다.
  - 그 날짜까지의 보유 수량보다 많이 팔면 저장을 막는다. 기존 기록이 꼬이면 계산에서 빼고 표시한다.
  - 환율은 `fx_rates`에 수동 입력한다(통화 1단위당 원, 통화별 최신 날짜를 사용).
  - 현금은 `cash_balances`(통화별)에 둔다. 비중의 분모 = 주식 평가액(원화) + 현금(원화)이다. 가격이나 환율이 없는 종목은 합계에서 빼고 경고한다.
  - 원화 평가손익은 현지 통화 평가손익 × 현재 환율이다(매수 시점 환율 차이는 반영하지 않는다).
  - 위험요인 태그는 `tags`·`stock_tags`이고, 종목 개요에서 붙인다. 태그별 노출은 합계가 100%를 넘을 수 있다.
  - 매매·비중 탭은 보유 수량과 파이프라인 단계가 어긋나면 이동을 안내한다(보유인데 단계가 그 이전 → 보유로, 전량 매도인데 보유 → 매도로).
- **보유 점검 (7단계)**:
  - `holding_reviews`에 점검일, 기준 메모 버전, 논리별 상태(유효/약화/훼손 + 근거), 매도 조건 평가, 촉매 상태(대기/발생/빗나감), 결정(유지/추가매수/일부매도/전량매도)과 이유(필수), 당시 가격을 남긴다.
  - 점검 기준 메모는 최신 확정본이다(없으면 작성 중인 메모).
  - 매도 조건 자동 평가(`evaluateSellCondition`):
    - 지표 값이 있는 가장 최근 기간부터 거꾸로 N개 연속 기간이 모두 조건을 만족하면 '충족'이다.
    - 분기 조건인데 분기 데이터가 없거나 중간이 비면 '수동 확인 필요'다. 연간 데이터가 모자라면 '데이터 부족'이다.
    - 매출 성장률은 전년 동기 대비다.
    - 최종 판단은 사용자가 `userJudgement`로 고른다.
  - 점검 필요 = 마지막 점검(없으면 보유 단계로 들어온 시각 `stageChangedAt`) 후 100일 이상이다.
  - 전량 매도로 결정하면 매도 단계 이동을 안내한다.
- **복기 (8단계)**:
  - `retrospectives`의 kind는 final(매도 후)과 interim(보유 중 중간 복기)이다.
  - 결과(수익/손실) × 과정(논리 적중/빗나감) → 실력·운·불운·실수.
  - 수익률 제안 = (실현손익 + 보유분 평가손익) ÷ 총 매수 금액.
  - 실수 태그는 `mistake_tags`(기본 10개 시드, 사용자 추가)와 `retrospective_tags`로 관리한다.
  - 복기 화면은 확정 메모 스냅샷(기본 원본 v1, 다른 버전 선택 가능)과 실제 결과를 나란히 놓는다. 실제 결과에는 보유 기간, 매수가, 매도가, 손익, 매도 사유, 점검 이력, 게이트 우회 기록이 들어간다.
  - **교훈 반영**(`applyLesson`):
    - 원칙에 반영하면 `rules`에 추가하고 새 원칙 버전을 만든다(사유 "교훈 반영: 종목 복기(날짜)").
    - 1차 필터에 반영하면 `filter_items`에 `origin=lesson`, `originRef=복기 id`로 추가한다.
    - 반영 기록은 `appliedLessons`에 남는다.
  - 게이트: 매도 → 복기 완료는 final 복기가 있어야 통과한다.
- **대시보드**:
  - 점검 필요, 복기 대기(매도 후 복기 없음, 1년 넘게 복기가 없는 보유 종목)
  - 다가오는 촉매: 진행 중 종목의 최신 메모 기준 120일 이내와 지난 60일. 마지막 점검에서 발생·빗나감으로 표시한 촉매는 뺀다.
  - 2×2 분포와 실수 태그 누적: final 복기만 센다.
  - 관심 가격 구간, 게이트 우회 기록
- **백업·내보내기 (7단계)**:
  - **백업**: `GET /api/backup`이 `{ app, schemaVersion, exportedAt, counts, tables }` JSON을 준다. `schemaVersion`은 적용된 마이그레이션 수다. 테이블 목록은 `lib/server/backup.ts`의 `TABLES`(외래키 순서)이고, API 캐시(dart_corps, sec_tickers, kv)는 뺀다.
  - **새 테이블을 추가하면 반드시 `TABLES`에도 넣는다.** 넣지 않으면 백업에서 빠진다.
  - **복원**: `POST /api/backup`. 현재 앱보다 새 버전의 백업만 거부하고, 예전 버전 백업은 받는다(없는 컬럼은 기본값, 없는 테이블은 빈 채로). **그래서 마이그레이션은 테이블·컬럼 추가만 한다.** 이름 변경이나 삭제가 필요하면 `importBackup`에 변환을 넣는다. 복원 직전 상태를 `data/backups/pre-import-*.json`에 저장한 뒤, 한 트랜잭션에서 전부 지우고 다시 넣는다(`defer_foreign_keys`).
    - 화면에서는 "복원"을 입력해야 실행된다.
    - Server Action 대신 Route Handler를 쓰는 이유는 본문 크기 제한(1MB) 때문이다.
  - **CSV**: `GET /api/export/[kind]`. UTF-8 BOM과 CRLF로 엑셀에서 한글이 깨지지 않는다. 금액은 원 단위 그대로다.
    - 재무 CSV는 붙여넣기 형식(첫 열 계정명, 첫 행 기간)이라 다시 넣으면 그대로 들어간다.
  - 다운로드 링크는 `DownloadButton`(일반 `<a download>`)을 쓴다. `Link`는 API를 프리페치하므로 쓰지 않는다.
- **화면 공통**:
  - 페이지 제목은 `metadata.title`이고 템플릿 `%s · 가치투자 프로세스`를 따른다.
  - `app/error.tsx`, `not-found.tsx`, `loading.tsx`는 한국어다.
  - 종목 개요 맨 위의 `ProcessSummary`가 단계별 진행 상황을 한 줄로 보여 준다.
  - 휴대폰(390px)부터 데스크톱까지 문서 가로 넘침이 없어야 한다. 넓은 표는 카드 안에서만 가로로 스크롤한다.
- **시세 (현재가·환율 자동 조회)**:
  - 한국 종목은 네이버 증권 모바일 API, 미국·유럽 종목과 환율(`{통화}KRW=X`)은 Yahoo Finance chart API를 쓴다. 둘 다 키가 없는 비공식 API이므로 응답 해석은 `integrations/price/normalize.ts`(순수, fixture 테스트)에만 둔다.
  - 한국 종목은 네이버가 실패하면 Yahoo(.KS)로 넘어간다.
  - 받은 통화가 종목 통화와 다르면 거부한다. 유럽 종목은 티커를 Yahoo 형식(NESN.SW 등)으로 입력해야 한다.
  - 런던 펜스(GBp)는 파운드로 바꾼다. 날짜는 거래소 시간대 기준이다.
  - `prices.source`와 `fx_rates.source`는 manual|naver|yahoo다. 같은 날짜면 manual이 우선한다(현재가 서브쿼리와 `latestFxRates`의 정렬).
  - 자동 값은 (종목, 날짜, 출처)당 한 행만 두고, 다시 갱신하면 교체한다.
  - `lib/server/price-refresh.ts`의 `refreshPrices`가 갱신한다.
    - 대상은 아이디어~보유 단계 종목과, 그 종목·보유·현금 통화의 환율이다.
    - 동시 실행 4개, 요청당 10초 제한이다. 전체 갱신은 전역 Promise로 중복 실행을 막는다.
    - 결과와 시각은 `kv`(`prices_refreshed_at`, `prices_last_result`)에 남긴다.
  - 자동 갱신: 대시보드·포트폴리오를 열 때 `PriceRefreshBar`가 오늘(한국 시각) 갱신 기록이 없으면 백그라운드로 한 번 실행한다. 설정에서 끌 수 있다(`kv.price_auto_refresh`). 종목 화면에는 그 종목만 가져오는 '지금 가져오기' 버튼이 있다.
  - 새 시세 소스를 붙이려면 `PriceProvider`를 구현하고 `providersFor()`에 넣는다.
- **후보 가져오기**: CSV(클라이언트에서 papaparse로 해석)와 `POST /api/candidates`가 같은 `candidateSchema`와 `importCandidates()`를 쓴다. 같은 시장·티커는 건너뛴다. 엑셀이 지운 한국 종목코드의 앞자리 0은 복구한다. `IMPORT_API_TOKEN`을 설정하면 Bearer 인증이 필요하다.
- **확신도별 권장 범위**: 원칙에 저장한다(기본값: 확신도 k이면 비중 상한의 (k-1)×20% ~ k×20%).
- **UI**: 한국어. 데스크톱 우선이고 md(768px) 이상에서 사이드바가 아이콘만 남는다. 다크모드는 next-themes의 class 방식이며, 색은 `globals.css`의 CSS 변수 토큰을 쓴다(`bg-surface`, `text-muted`, `text-danger` 등).

## 사용자와 합의한 기본안

- 가치평가: 종목마다 대표 방법 하나를 고르고, 그 방법의 시나리오별 값을 확률로 가중해 내재가치로 쓴다. 나머지 방법은 football field 차트의 참고 범위로만 보여준다.
- DCF: 소유주 이익은 회사 전체 금액으로 입력한다. 할인한 합계에 순현금을 더해(순부채면 뺀다) 희석 주식 수로 나눈다. 소유주 이익은 순이익 + 감가상각 − 유지 CAPEX로 자동 제안한다.
- 비중 상한 = 종목당 허용 최대 손실 ÷ 비관 시나리오 하락률. 하락률이 0 이하이면 원칙의 종목당 최대 비중을 상한으로 쓴다.
- 재무 데이터: 연간 10년과 최근 12개 분기를 수집한다. 분기 데이터가 없는 매도 조건은 "수동 확인 필요"로 표시한다.
- 시장은 KR/US/EU/OTHER로 나눈다. 산업은 원칙의 '능력의 범위'에서 고르고, 범위 밖이면 경고한다.

## 개발 단계 진행 상황

1. [x] 셋업, 데이터 모델, 종목 CRUD, 칸반, 0·1·2단계
2. [x] 3단계 심층 분석(재무 수동 입력), 체크리스트 템플릿(필립 피셔 15)
3. [x] DART / SEC EDGAR 연동, 재무 지표 자동 계산과 차트 (계정 매핑은 실제 응답으로 작성. 사용자 파이썬 스크립트를 받으면 대조할 것)
4. [x] 가치평가 계산기, 역DCF, 테스트
5. [x] 투자 메모·스냅샷, 매매 기록·포트폴리오
6. [x] 보유 점검, 복기, 대시보드 완성
7. [x] 백업/내보내기, 다듬기
