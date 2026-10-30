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
  components/
    ui/                 # 공용 UI (Button, Input, Card, Dialog 등. 자체 구현, 외부 UI 키트 없음)
    pipeline/           # 칸반 보드, useStageMove (단계 이동 + 게이트 다이얼로그)
    stocks/ principles/ settings/
  db/
    schema.ts           # Drizzle 스키마 (단일 진실 공급원)
    index.ts            # better-sqlite3 연결, 자동 마이그레이션·시드 (server-only)
    queries.ts          # 읽기 쿼리 (server-only)
    seed.ts             # 기본 원칙, 1차 필터 기본 항목
  domain/               # ★ 순수 함수. DB·UI를 모름. Vitest 대상
    pipeline.ts         # 단계 정의, evaluateMove (게이트 판정)
    format.ts           # 억원/조원, $M/$B, 숫자 파싱
    stock.ts            # 시장·발굴경로 상수, candidateSchema (CSV·API 공용 검증)
    principles.ts       # 원칙 스키마, 기본값, diff
  integrations/
    price/              # PriceProvider 인터페이스 + ManualPriceProvider
  lib/
    action.ts           # ActionResult 타입, 헬퍼 (클라이언트에서도 import 가능)
    server/candidates.ts# 후보 일괄 등록 로직 (CSV 액션과 API 라우트 공용)
tests/                  # domain/* 단위 테스트
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
- **게이트 컨텍스트**: `db/queries.ts`의 `getGateContext()`. 가치평가·메모·복기 테이블은 이후 개발 단계에서 생기므로, 그때 이 함수를 채운다. 그 전까지는 해당 게이트가 항상 실패한다.
- **탈락**: `stocks.rejectedFromStage`와 `rejectReason`. 복원하면 원래 단계로 돌아간다.
- **1차 필터 항목**: 기록이 남은 항목은 삭제하지 않고 비활성화한다(과거 판단 보존). `autoKey`는 DART 자동 체크 연결용이다. `origin='lesson'`은 복기 교훈에서 온 항목이다.
- **가격**: `PriceProvider` 인터페이스로 추상화했다. 지금은 수동 입력(`prices` 테이블)만 쓰고, 가장 최근 날짜의 가격을 현재가로 본다.
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
2. [ ] 3단계 심층 분석(재무 수동 입력), 체크리스트 템플릿(필립 피셔 15)
3. [ ] DART / SEC EDGAR 연동, 재무 지표 자동 계산과 차트 (사용자가 보낼 파이썬 스크립트의 계정 매핑 참고)
4. [ ] 가치평가 계산기, 역DCF, 테스트
5. [ ] 투자 메모·스냅샷, 매매 기록·포트폴리오
6. [ ] 보유 점검, 복기, 대시보드 완성
7. [ ] 백업/내보내기, 다듬기
