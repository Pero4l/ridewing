"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(16_185_129/0.10),transparent)] dark:bg-[radial-gradient(60%_100%_at_50%_0%,rgb(16_185_129/0.14),transparent)]" />

      <header className="relative flex flex-col items-center gap-2 pb-8 pt-12">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
          <WingMark className="h-8 w-8" />
        </div>
        <div className="mt-3 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">RideWing</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Voice, chat and group rides — with people you choose.
          </p>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-sm flex-1 px-4 pb-10">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40">
          {children}
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-zinc-400 dark:text-zinc-600">
          RideWing is private by design. Sessions use password hashing,
          <br />
          cookie-backed auth and scoped access tokens.
        </p>
      </div>
    </main>
  );
}

export function WingMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5c1.6 2.6 3.4 4.2 6 5.5-.7 4.2-3.1 7.2-6 8.4-2.9-1.2-5.3-4.2-6-8.4 2.6-1.3 4.4-2.9 6-5.5Z" opacity="0.92" />
      <path d="M3 17.5c1.9-.4 3.6-.2 5.2.5C9.7 19 11 20.2 12 22c1-1.8 2.3-3 3.8-4 1.6-.7 3.3-.9 5.2-.5-.8 2.3-2.1 4-4.5 4.5-1.3 1.2-3 2-4.5 2.5-1.5-.5-3.2-1.3-4.5-2.5C5.1 21.5 3.8 19.8 3 17.5Z" />
    </svg>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
    >
      {children}
    </Link>
  );
}