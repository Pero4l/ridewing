"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui";
import { SpinnerIcon } from "@/components/spinner";
import { CheckIcon, VerifiedBadgeIcon } from "@/components/icons";

const LINK_BUTTON =
  "inline-flex h-10 w-full select-none items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400";

type VerifyStatus = "idle" | "working" | "verified" | "failed" | "guest-needed";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell><VerifyCard status="working">{null}</VerifyCard></AuthShell>}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const { status, user, refreshUser, logout } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [errorSent, setErrorSent] = useState(false);
  const [code, setCode] = useState("");
  const [verify, setVerify] = useState<VerifyStatus>("idle");

  // Compute base status from session (for initial render and when not in async flow)
  const baseStatus: VerifyStatus = status === "loading" ? "working" : status === "guest" ? "guest-needed" : user?.emailVerifiedAt ? "verified" : "idle";

  // Effective status: use async state if we're in an async flow, otherwise use base status
  const effectiveVerify = verify !== "idle" ? verify : baseStatus;

  const sendNewCode = useCallback(async () => {
    setError(null);
    setVerify("working");
    try {
      await api.post("/api/auth/send-verification");
      setVerify("idle");
      setErrorSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a verification email");
      setVerify("idle");
    }
  }, []);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) return;
    setError(null);
    setVerify("working");
    try {
      await api.post("/api/auth/verify-email", { code });
      await refreshUser();
      setVerify("verified");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify. Check the code and try again.");
      setVerify("failed");
    }
  }, [code, refreshUser]);

  return (
    <AuthShell>
      <VerifyCard status={effectiveVerify} onSignOut={effectiveVerify === "guest-needed" ? null : () => void logout()}>
        {effectiveVerify === "guest-needed" && (
          <div className="text-center">
            <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              Sign in, then come back to verify your email.
            </p>
            <Link className={LINK_BUTTON} href="/login">
              Sign in
            </Link>
          </div>
        )}

        {effectiveVerify === "verified" && (
          <div className="text-center">
            <VerifiedBadgeIcon size={40} className="mx-auto text-emerald-500 dark:text-emerald-400" />
            <p className="mt-3 font-semibold text-zinc-900 dark:text-zinc-100">Email verified</p>
            <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              You can now join communities and get the verified badge on your profile.
            </p>
            <Link className={LINK_BUTTON} href="/app">
              Go to your rides
            </Link>
          </div>
        )}

        {effectiveVerify === "failed" && (
          <div>
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
            <Button full className="mt-4" onClick={() => void sendNewCode()}>
              Email me a new code
            </Button>
          </div>
        )}

        {effectiveVerify === "idle" && (
          <div className="space-y-4">
            <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400 text-center">
              Enter the 6-digit code from your email
            </p>
            <Button full onClick={() => void sendNewCode()}>
              {errorSent ? "Sent — check your inbox" : "Send verification email"}
            </Button>
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  {[...Array(6)].map((_, i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={1}
                      value={code[i] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        if (val) {
                          setCode((prev) => prev.slice(0, i) + val + prev.slice(i + 1));
                          // Auto-focus next input
                          const nextInput = e.currentTarget.parentElement?.querySelector(`input[data-index="${i + 1}"]`) as HTMLInputElement | null;
                          nextInput?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !code[i] && i > 0) {
                          const prevInput = e.currentTarget.parentElement?.querySelector(`input[data-index="${i - 1}"]`) as HTMLInputElement | null;
                          prevInput?.focus();
                        }
                      }}
                      data-index={i}
                      className="h-12 w-10 text-center text-xl font-bold rounded-lg border border-zinc-300 bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                <Button full type="submit" disabled={code.length !== 6}>
                  Verify
                </Button>
              </form>
            </div>
          </div>
        )}
      </VerifyCard>
    </AuthShell>
  );
}

function VerifyCard({ children, status, onSignOut }: { children: React.ReactNode; status: VerifyStatus; onSignOut?: (() => void) | null }) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2">
        <BrandMark className="h-10 w-10" />
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Verify your email</h1>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {status === "working" ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
            <SpinnerIcon size={16} className="animate-spin" /> Working…
          </div>
        ) : (
          children
        )}
      </div>
      <p className="mt-4 flex items-center justify-center gap-1 text-center text-xs text-zinc-400 dark:text-zinc-500">
        <CheckIcon size={12} /> Codes are sent from RideWing and expire within 10 minutes.
      </p>
      {onSignOut && (
        <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Wrong account? <button type="button" onClick={onSignOut} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Sign out</button>
        </p>
      )}
    </div>
  );
}