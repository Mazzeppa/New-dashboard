import { describe, expect, it } from "vitest";
import { createSessionToken, safeEqual, safeNextPath, verifySessionToken } from "@/lib/auth";

describe("세션 토큰", () => {
  const now = Date.parse("2026-11-03T00:00:00Z");

  it("같은 비밀번호로 만든 토큰은 통과", async () => {
    const t = await createSessionToken("secret-pw", now);
    expect(await verifySessionToken("secret-pw", t, now)).toBe(true);
  });

  it("비밀번호가 바뀌면 무효", async () => {
    const t = await createSessionToken("secret-pw", now);
    expect(await verifySessionToken("new-pw", t, now)).toBe(false);
  });

  it("만료(30일) 후 무효", async () => {
    const t = await createSessionToken("pw", now);
    expect(await verifySessionToken("pw", t, now + 29 * 86_400_000)).toBe(true);
    expect(await verifySessionToken("pw", t, now + 31 * 86_400_000)).toBe(false);
  });

  it("만료 시각을 늘려 위조하면 무효", async () => {
    const [, sig] = (await createSessionToken("pw", now)).split(".");
    expect(await verifySessionToken("pw", `${now + 999 * 86_400_000}.${sig}`, now)).toBe(false);
  });

  it("빈 값·형식 오류는 무효", async () => {
    expect(await verifySessionToken("pw", undefined, now)).toBe(false);
    expect(await verifySessionToken("pw", "garbage", now)).toBe(false);
    expect(await verifySessionToken("pw", "123.", now)).toBe(false);
  });
});

describe("safeEqual / safeNextPath", () => {
  it("문자열 비교", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
  it("로그인 후 이동은 사이트 안 경로만", () => {
    expect(safeNextPath("/portfolio?x=1")).toBe("/portfolio?x=1");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
