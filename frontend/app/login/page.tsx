"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { Button, Field, Input, PasswordInput } from "@/components/ui";

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
  const toast = useToast();
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

    if (!identifier.trim()) {
      setError("Enter your username, email or phone");
      return;
    }
    if (!password) {
      setError("Enter your password");
      return;
    }

    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      toast.success("Signed in. Welcome back!");
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Welcome back</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Sign in to find your ride.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Username, email or phone">
          <Input
            autoFocus
            autoComplete="username"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
            invalid={Boolean(error)}
          />
        </Field>
        <Field label="Password">
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            invalid={Boolean(error)}
          />
        </Field>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300">
            Forgot password?
          </Link>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" full loading={submitting} size="lg">
          Sign in
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-center">
        <AuthLink href="/register">Create an account</AuthLink>
      </div>
    </AuthShell>
  );
}