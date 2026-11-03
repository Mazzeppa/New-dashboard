"use client";

import * as React from "react";
import { login } from "@/app/actions/auth";
import { Alert, Button, Input } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = React.useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <Input type="password" name="password" autoComplete="current-password" autoFocus required aria-label="비밀번호" />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "확인 중…" : "로그인"}
      </Button>
    </form>
  );
}
