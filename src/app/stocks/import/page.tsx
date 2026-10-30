import { Card, CardHeader, PageHeader } from "@/components/ui";
import { CsvImport } from "@/components/stocks/csv-import";

export const metadata = { title: "후보 가져오기" };

const EXAMPLE = `curl -X POST http://localhost:3000/api/candidates \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $IMPORT_API_TOKEN" \\
  -d '{
    "source": "my-screener",
    "candidates": [
      { "market": "KR", "ticker": "005930", "name": "삼성전자",
        "source": "quant_screen", "sourceNote": "PBR<1, ROE>8%" }
    ]
  }'`;

export default function ImportPage() {
  return (
    <>
      <PageHeader title="후보 가져오기" description="외부에서 찾은 후보 종목을 한 번에 아이디어 단계로 등록합니다." />
      <div className="flex max-w-5xl flex-col gap-5">
        <CsvImport />
        <Card>
          <CardHeader
            title="API로 등록 (스크리너 연결용)"
            description="POST /api/candidates. .env에 IMPORT_API_TOKEN을 설정하면 Bearer 토큰이 필요합니다. 응답은 등록·건너뜀·오류 내역입니다."
          />
          <pre className="overflow-x-auto p-4 text-xs">{EXAMPLE}</pre>
        </Card>
      </div>
    </>
  );
}
