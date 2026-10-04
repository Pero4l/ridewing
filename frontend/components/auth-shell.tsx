"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup, GrandcrestCredit } from "@/components/brand";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(16_185_129/0.10),transparent)] dark:bg-[radial-gradient(60%_100%_at_50%_0%,rgb(16_185_129/0.14),transparent)]" />

      <header className="relative flex flex-col items-center gap-4 pb-8 pt-12">
        {/* The real logo, on the dark plate its white artwork needs. */}
        <BrandLockup className="w-56 sm:w-64" />
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Voice, chat and group rides — with people you choose.
        </p>
      </header>

      <div className="relative mx-auto w-full max-w-sm flex-1 px-4 pb-10">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40">
          {children}
        </div>

        <div className="mt-6 flex justify-center">
          <GrandcrestCredit />
        </div>
      </div>
    </main>
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
