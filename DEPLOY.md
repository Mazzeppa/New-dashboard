# 인터넷에 올리기 (Railway)

이 앱을 클라우드 서버에 올리면 `https://…up.railway.app` 같은 주소로 PC·휴대폰 어디서나 열 수 있습니다.
비밀번호를 아는 사람만 들어올 수 있습니다.

- 비용: Railway Hobby 요금제, 월 5달러(약 7천 원) 정도입니다. 이 앱은 혼자 쓰면 그 안에서 충분합니다.
- 필요한 것: GitHub 계정(이미 있음), 결제 카드, DART API 키.
- 걸리는 시간: 처음 한 번 15분 정도입니다. 그다음부터는 코드가 바뀌면 자동으로 다시 배포됩니다.

## 1. Railway 가입

1. https://railway.com 에 접속해 **Login → GitHub로 로그인**합니다.
2. 요금제 화면에서 **Hobby**를 고르고 카드를 등록합니다. 무료 체험(Trial)은 사용량과 기간 제한이 있어 데이터를 계속 보관하기 어렵습니다.

## 2. 저장소 연결

1. 대시보드에서 **New Project → Deploy from GitHub repo**를 누릅니다.
2. GitHub 권한을 묻는 창이 뜨면 `new-dashboard` 저장소 접근을 허용합니다.
3. 목록에서 **Mazzeppa/new-dashboard**를 고릅니다.
   - 첫 빌드가 바로 시작됩니다. 아직 설정 전이라 실패하거나 데이터가 남지 않아도 괜찮습니다. 아래 단계를 마치면 다시 배포됩니다.

## 3. 데이터 저장 공간(Volume) 붙이기 — 꼭 해야 합니다

Volume이 없으면 다시 배포할 때마다 **입력한 데이터가 모두 사라집니다.**

1. 프로젝트 화면에서 서비스(`new-dashboard` 상자)를 오른쪽 클릭하거나, **+ Create** 메뉴에서 **Volume**을 고릅니다.
2. 연결할 서비스로 `new-dashboard`를 고르고, **Mount path**에 `/data`를 입력합니다.

## 4. 설정값(Variables) 넣기

서비스를 클릭한 뒤 **Variables** 탭에서 **New Variable**로 하나씩 추가합니다.

| 이름 | 값 |
|---|---|
| `APP_PASSWORD` | 로그인 비밀번호. 길고 추측하기 어렵게 정하세요(예: 단어 3~4개 + 숫자) |
| `DART_API_KEY` | DART에서 발급받은 키 |
| `SEC_USER_AGENT` | `홍길동 hong@example.com` 형식 (본인 이름과 이메일, 따옴표 없이) |

`DATABASE_PATH`는 넣지 않아도 됩니다. 이미 `/data/app.db`로 설정되어 있습니다.

## 5. 주소 만들기

1. 서비스의 **Settings → Networking**에서 **Generate Domain**을 누릅니다.
2. `https://new-dashboard-production-xxxx.up.railway.app` 같은 주소가 생깁니다.
3. 변수를 넣은 뒤 배포가 자동으로 다시 시작되지 않았다면, **Deployments** 탭에서 **Redeploy**를 누릅니다.

배포 상태가 **Active**(초록색)가 되면 그 주소를 열고 `APP_PASSWORD`로 로그인합니다. 휴대폰에서는 브라우저의 "홈 화면에 추가"를 쓰면 앱처럼 열 수 있습니다.

## 쓰다 보면

- **비밀번호 변경**: Variables에서 `APP_PASSWORD`를 바꾸면 다시 배포되고, 모든 기기에서 다시 로그인해야 합니다.
- **백업**: 설정 → 백업과 내보내기에서 JSON 백업을 가끔 받아 두세요. Volume이 있어도 백업은 따로 있는 것이 안전합니다.
- **내 PC에서 쓰던 데이터 옮기기**: PC 앱에서 백업 파일을 받은 뒤, 웹 앱의 설정 → "백업에서 복원"으로 올리면 됩니다.
- **업데이트**: GitHub의 `main` 브랜치에 새 코드가 올라가면 Railway가 자동으로 다시 배포합니다. 데이터는 Volume에 남습니다.
- **배포 실패**: Deployments 탭에서 실패한 배포를 열면 로그가 보입니다. 그 내용을 그대로 알려 주시면 해결을 도와드립니다.

## 보안 참고

- 로그인은 비밀번호 하나로 하는 방식이고, 세션은 30일 유지됩니다. 틀린 비밀번호를 연달아 넣으면 응답이 점점 느려집니다.
- 스크리너 연결용 `POST /api/candidates`는 `IMPORT_API_TOKEN`을 설정하면 그 토큰으로 접근할 수 있습니다. 설정하지 않으면 로그인한 사람만 쓸 수 있습니다.
