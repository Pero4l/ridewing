"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { AuthShell, WingMark } from "@/components/auth-shell";
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
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { status, user, refreshUser, logout } = useSession();
  const [verify, setVerify] = useState<VerifyStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorSent, setErrorSent] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (status === "loading") return;
      if (status === "guest") {
        if (!cancelled) setVerify("guest-needed");
        return;
      }
      // Already verified on this device — nothing to do.
      if (user?.emailVerifiedAt) {
        if (!cancelled) setVerify("verified");
        return;
      }
      if (!token) {
        if (!cancelled) setVerify("idle");
        return;
      }
      if (ranRef.current) return;
      ranRef.current = true;

      if (!cancelled) setVerify("working");
      try {
        await api.post("/api/auth/verify-email", { token });
        if (!cancelled) await refreshUser();
        if (!cancelled) setVerify("verified");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not verify your email");
          setVerify("failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user?.emailVerifiedAt, token, refreshUser]);

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

  return (
    <AuthShell>
      <VerifyCard status={verify} onSignOut={verify === "guest-needed" ? null : () => void logout()}>
        {verify === "guest-needed" && (
          <div className="text-center">
            <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              Sign in, then come back to this link to confirm your email.
            </p>
            <Link className={LINK_BUTTON} href={`/login?next=${encodeURIComponent(`/verify-email?token=${token}`)}`}>
              Sign in
            </Link>
          </div>
        )}

        {verify === "verified" && (
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

        {verify === "failed" && (
          <div>
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
            <Button full className="mt-4" onClick={() => void sendNewCode()}>
              Email me a new link
            </Button>
          </div>
        )}

        {verify === "idle" && (
          <div className="text-center">
            <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              No verification link in the address bar. Request a fresh one below.
            </p>
            <Button full onClick={() => void sendNewCode()}>
              {errorSent ? "Sent — check your inbox" : "Send verification email"}
            </Button>
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
        <WingMark className="text-emerald-600" />
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
        <CheckIcon size={12} /> Emails are sent from RideWing and expire within 24 hours.
      </p>
      {onSignOut && (
        <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Wrong account? <button type="button" onClick={onSignOut} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Sign out</button>
        </p>
      )}
    </div>
  );
}