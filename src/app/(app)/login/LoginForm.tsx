"use client";
import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="card flex flex-col gap-4 p-6">
      <input type="hidden" name="next" value={next} />
      {/* lets password managers file the credential; the value isn't used */}
      <input type="text" name="username" autoComplete="username" defaultValue="owner" hidden readOnly />
      <label className="flex flex-col gap-2 text-[13px] text-ink-2">
        Password
        <input
          type="password"
          name="password"
          required
          maxLength={512}
          autoComplete="current-password"
          className="h-12 rounded-[14px] bg-raised px-4 text-[15px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-[13px] text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-full bg-inverse text-[15px] text-inverse-ink disabled:opacity-60">
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
