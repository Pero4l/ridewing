"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { Button, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post<{ sent: boolean }>("/api/auth/forgot-password", { email: email.trim() }, { skipAuth: true });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the reset email. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Reset your password</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Enter your account email and we&apos;ll send a reset link.
        </p>
      </div>

      {sent ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          If an account exists for that address, a password reset link is on its way. Check your inbox (and spam).
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              autoFocus
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" full loading={submitting} size="lg">
            Send reset link
          </Button>
        </form>
      )}

      <div className="mt-6 flex items-center justify-center">
        <AuthLink href="/login">Back to sign in</AuthLink>
      </div>
    </AuthShell>
  );
}