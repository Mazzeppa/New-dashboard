import { LoginForm } from "./login-form";

export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="text-xl font-bold">가치투자 프로세스</h1>
      <p className="mt-1 mb-6 text-sm text-muted">비밀번호를 입력하세요.</p>
      <LoginForm next={next ?? "/"} />
    </div>
  );
}
