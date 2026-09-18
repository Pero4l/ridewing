"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";

/**
 * Chrome-free layout for the full-screen conversation thread. The app header
 * and bottom nav are intentionally absent so the chat owns the whole viewport,
 * Instagram-style.
 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "guest") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || status === "guest") {
    return <div className="grid min-h-dvh place-items-center bg-zinc-50 dark:bg-zinc-950" />;
  }

  return <div className="min-h-dvh bg-white dark:bg-zinc-950">{children}</div>;
}