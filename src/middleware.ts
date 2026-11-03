import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, verifySessionToken } from "@/lib/auth";

/**
 * APP_PASSWORD가 설정된 경우(인터넷 배포) 로그인하지 않은 요청을 막는다.
 * - 화면 요청은 /login으로 보내고, API 요청은 401을 준다.
 * - 스크리너용 POST /api/candidates는 IMPORT_API_TOKEN Bearer 토큰으로도 통과한다.
 */
export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const importToken = process.env.IMPORT_API_TOKEN;
  const auth = req.headers.get("authorization");
  if (pathname === "/api/candidates" && importToken && auth && safeEqual(auth, `Bearer ${importToken}`)) {
    return NextResponse.next();
  }

  if (await verifySessionToken(password, req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 파일과 Next 내부 경로는 검사하지 않는다
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
