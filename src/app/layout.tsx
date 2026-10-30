import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ThemeProvider } from "@/components/theme";

export const metadata: Metadata = {
  title: { default: "가치투자 프로세스", template: "%s · 가치투자 프로세스" },
  description: "아이디어에서 복기까지, 가치투자 프로세스를 기록하고 지키는 개인용 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <div className="flex min-h-screen flex-col md:flex-row">
            <Nav />
            <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
