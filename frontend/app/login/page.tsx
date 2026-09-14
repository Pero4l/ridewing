"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { Button, Field, Input } from "@/components/ui";

const DEV_ACCOUNTS = [
  { label: "ptb", identifier: "ptb" },
  { label: "maya", identifier: "maya" },
  { label: "dev", identifier: "dev" },
  { label: "sam", identifier: "sam" },
];

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell><div className="min-h-40" /></AuthShell>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const { login } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only ever redirect to a same-app relative path.
  const redirectTo = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/app";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier, password);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function quickFill(devIdentifier: string) {
    setIdentifier(devIdentifier);
    setPassword("RideWing!Dev2026");
    setError(null);
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Welcome back</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sign in to find your ride.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Username, email or phone">
          <Input
            autoFocus
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="ptb"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
            required
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" full loading={submitting} size="lg">
          Sign in
        </Button>
      </form>

      <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
        <p className="mb-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Demo riders — password <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-emerald-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-emerald-300 dark:ring-zinc-700">RideWing!Dev2026</code>
        </p>
        <div className="flex flex-wrap gap-2">
          {DEV_ACCOUNTS.map((account) => (
            <button
              key={account.identifier}
              type="button"
              onClick={() => quickFill(account.identifier)}
              className="rounded-full border border-zinc-200 px-3.5 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-emerald-500/50 hover:bg-emerald-50 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
            >
              @{account.identifier}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center">
        <AuthLink href="/register">Create an account</AuthLink>
      </div>
    </AuthShell>
  );
}