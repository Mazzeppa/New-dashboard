import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { importCandidates } from "@/lib/server/candidates";

/**
 * 외부 후보 종목 일괄 등록 (스크리너 연결용).
 *
 * POST /api/candidates
 * Body: { "source": "screener-v1", "candidates": [{ market, ticker, name, currency?, industry?, source?, sourceNote?, note?, watchLow?, watchHigh? }] }
 * IMPORT_API_TOKEN이 설정되어 있으면 Authorization: Bearer <token> 헤더가 필요하다.
 */
export async function POST(req: NextRequest) {
  const token = process.env.IMPORT_API_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = body as { source?: unknown; candidates?: unknown };
  const rows = Array.isArray(body) ? body : b?.candidates;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "candidates 배열이 필요합니다." }, { status: 400 });
  }
  if (rows.length > 2000) {
    return NextResponse.json({ error: "한 번에 2,000건까지 등록할 수 있습니다." }, { status: 413 });
  }

  const report = importCandidates(rows, typeof b?.source === "string" ? b.source : "api");
  revalidatePath("/", "layout");
  const status = report.errors.length && !report.created.length ? 422 : 200;
  return NextResponse.json(report, { status });
}
