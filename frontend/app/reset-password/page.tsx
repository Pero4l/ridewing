"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { Button, Field, Input } from "@/components/ui";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell><div className="min-h-40" /></AuthShell>}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post<{ message: string }>("/api/auth/reset-password", { token, password }, { skipAuth: true });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Choose a new password</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Your password must be at least 8 characters.
        </p>
      </div>

      {!token ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          This reset link is invalid. Request a new one below.
        </p>
      ) : done ? (
        <div className="space-y-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            Password updated. All your sessions were signed out.
          </div>
          <div className="flex items-center justify-center">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New password">
            <Input
              autoFocus
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm password">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="••••••••••"
              minLength={8}
              required
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" full loading={submitting} size="lg">
            Update password
          </Button>
        </form>
      )}

      <div className="mt-6 flex items-center justify-center">
        <AuthLink href="/forgot-password">Request a new reset link</AuthLink>
      </div>
    </AuthShell>
  );
}