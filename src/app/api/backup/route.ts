import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { exportBackup, importBackup } from "@/lib/server/backup";

/** 전체 데이터 JSON 백업 다운로드 */
export async function GET() {
  const backup = exportBackup();
  const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(JSON.stringify(backup, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="value-process-backup-${stamp}.json"`,
    },
  });
}

/** 백업으로 전체 데이터 교체 (가져오기 직전 상태는 data/backups/에 자동 저장) */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 파일을 읽을 수 없습니다." }, { status: 400 });
  }
  try {
    const result = importBackup(body);
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
