"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, safeEqual, safeNextPath, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";

// 비밀번호 무작위 대입을 늦추기 위한 간단한 지연 (단일 사용자 앱이라 프로세스 메모리로 충분)
const g = globalThis as unknown as { __loginFails?: number };

export async function login(_prev: { error: string } | null, fd: FormData): Promise<{ error: string }> {
  const password = process.env.APP_PASSWORD;
  const next = safeNextPath(String(fd.get("next") ?? "/"));
  if (!password) redirect(next);

  const given = String(fd.get("password") ?? "");
  const fails = g.__loginFails ?? 0;
  if (fails > 0) await new Promise((r) => setTimeout(r, Math.min(fails, 10) * 500));

  if (!safeEqual(given, password)) {
    g.__loginFails = fails + 1;
    return { error: "비밀번호가 맞지 않습니다." };
  }
  g.__loginFails = 0;

  const proto = (await headers()).get("x-forwarded-proto");
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    // https로 접속했을 때만 secure (로컬 http 테스트도 되도록)
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
