/**
 * 비밀번호 로그인 (인터넷에 배포할 때만 사용).
 * APP_PASSWORD 환경변수가 없으면 인증을 하지 않는다(로컬 PC 실행).
 * 세션은 서버에 저장하지 않는 서명 토큰이다: "만료시각.서명", 서명 = HMAC-SHA256(키 = APP_PASSWORD, "vp1.만료시각").
 * 비밀번호를 바꾸면 기존 세션은 모두 무효가 된다. Web Crypto만 써서 미들웨어(edge)와 서버 양쪽에서 돈다.
 */

export const SESSION_COOKIE = "vp_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function toBase64Url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** 길이가 같을 때 비교 시간이 내용에 좌우되지 않는 문자열 비교 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const exp = now + SESSION_DAYS * 86_400_000;
  return `${exp}.${await sign(secret, `vp1.${exp}`)}`;
}

export async function verifySessionToken(secret: string, token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now || !sig) return false;
  return safeEqual(sig, await sign(secret, `vp1.${exp}`));
}

/** 로그인 후 돌아갈 경로: 같은 사이트 안의 경로만 허용 (외부 주소로 보내는 공격 방지) */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
