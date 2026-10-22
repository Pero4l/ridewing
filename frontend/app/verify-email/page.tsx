"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui";
import { SpinnerIcon } from "@/components/spinner";
import { SendIcon, CheckIcon, VerifiedBadgeIcon } from "@/components/icons";

const LINK_BUTTON =
  "inline-flex h-10 w-full select-none items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400";

type PageStatus = "loading" | "guest" | "idle" | "sending" | "verifying" | "verified";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell><LoadingCard /></AuthShell>}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const { status, user, refreshUser, logout } = useSession();

  // 6 individual digit slots
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Sync page status from session
  useEffect(() => {
    if (status === "loading") return;
    if (status === "guest") { setPageStatus("guest"); return; }
    if (user?.emailVerifiedAt) { setPageStatus("verified"); return; }
    setPageStatus("idle");
  }, [status, user?.emailVerifiedAt]);

  const code = digits.join("");
  const isComplete = code.length === 6 && digits.every((d) => d !== "");

  function handleDigitChange(index: number, raw: string) {
    // Strip non-digits
    const val = raw.replace(/\D/g, "");
    if (!val) return;

    // Take only the last character typed (handles held keys)
    const char = val[val.length - 1];
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError(null);

    // Advance focus
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (digits[index]) {
        // Clear current slot
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        // Already empty — clear previous slot and move focus back
        next[index - 1] = "";
        setDigits(next);
        inputRefs.current[index - 1]?.focus();
      }
      setError(null);
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === "Delete") {
      e.preventDefault();
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      setError(null);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    setError(null);
    // Focus the slot after the last pasted digit
    const nextFocus = Math.min(pasted.length, 5);
    inputRefs.current[nextFocus]?.focus();
  }

  // Clicking a filled slot should select it so the next keystroke replaces it
  function handleFocus(index: number) {
    inputRefs.current[index]?.select();
  }

  const sendCode = useCallback(async () => {
    setError(null);
    setPageStatus("sending");
    try {
      await api.post("/api/auth/send-verification");
      setCodeSent(true);
      setPageStatus("idle");
      // Focus first slot after sending
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a verification email. Try again.");
      setPageStatus("idle");
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete) return;
    setError(null);
    setPageStatus("verifying");
    try {
      await api.post("/api/auth/verify-email", { code });
      await refreshUser();
      setPageStatus("verified");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Incorrect code. Check your email and try again.");
      setPageStatus("idle");
      // Clear digits and refocus first slot
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [code, isComplete, refreshUser]);

  // ── Verified ─────────────────────────────────────────────────────────────
  if (pageStatus === "verified") {
    return (
      <AuthShell>
        <Card>
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <VerifiedBadgeIcon size={36} className="text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Email verified</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                You can now join communities and earn the verified badge on your profile.
              </p>
            </div>
            <Link className={LINK_BUTTON} href="/app">
              Go to your rides
            </Link>
          </div>
        </Card>
      </AuthShell>
    );
  }

  // ── Guest ────────────────────────────────────────────────────────────────
  if (pageStatus === "guest") {
    return (
      <AuthShell>
        <Card>
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <SendIcon size={28} className="text-zinc-400 dark:text-zinc-500" />
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Sign in first</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Sign in to your account, then come back to verify your email.
              </p>
            </div>
            <Link className={LINK_BUTTON} href="/login">
              Sign in
            </Link>
          </div>
        </Card>
      </AuthShell>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (pageStatus === "loading") {
    return (
      <AuthShell>
        <LoadingCard />
      </AuthShell>
    );
  }

  // ── Main (idle / sending / verifying) ────────────────────────────────────
  const isBusy = pageStatus === "sending" || pageStatus === "verifying";

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <BrandMark className="h-10 w-10" />
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Verify your email</h1>
          {user?.email && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Enter the 6-digit code sent to{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{user.email}</span>
            </p>
          )}
          {!user?.email && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Enter the 6-digit code from your email
            </p>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* OTP digit grid */}
            <div className="flex items-center justify-center gap-2.5" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={digit}
                  disabled={isBusy}
                  autoFocus={i === 0}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onFocus={() => handleFocus(i)}
                  onClick={() => handleFocus(i)}
                  className={[
                    "h-14 w-11 rounded-xl border-2 bg-white text-center text-2xl font-bold tabular-nums text-zinc-900 transition-all duration-150",
                    "dark:bg-zinc-900 dark:text-zinc-100",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    error
                      ? "border-red-400 dark:border-red-500"
                      : digit
                        ? "border-emerald-500 dark:border-emerald-500"
                        : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600",
                    "focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:focus:ring-emerald-500/20",
                  ].join(" ")}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            {/* Verify button */}
            <Button
              type="submit"
              full
              size="lg"
              loading={pageStatus === "verifying"}
              disabled={!isComplete || isBusy}
            >
              {pageStatus === "verifying" ? "Verifying…" : "Verify email"}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {codeSent ? "Code sent" : "No code yet?"}
            </span>
            <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          </div>

          {/* Resend */}
          <Button
            type="button"
            variant="secondary"
            full
            loading={pageStatus === "sending"}
            disabled={isBusy}
            onClick={() => void sendCode()}
          >
            {pageStatus === "sending"
              ? "Sending…"
              : codeSent
                ? "Resend code"
                : "Send verification email"}
          </Button>

          {codeSent && (
            <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Check your inbox — the code expires in 10 minutes.
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400 dark:text-zinc-500">
          <CheckIcon size={12} />
          Codes are sent from RideWing and expire in 10 minutes.
        </p>
        <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Wrong account?{" "}
          <button
            type="button"
            onClick={() => void logout()}
            className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Sign out
          </button>
        </p>
      </div>
    </AuthShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2">
        <BrandMark className="h-10 w-10" />
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Verify your email</h1>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500 dark:text-zinc-400">
        <SpinnerIcon size={16} className="animate-spin" />
        Loading…
      </div>
    </Card>
  );
}
