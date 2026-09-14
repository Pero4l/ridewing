"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import { NotificationsProvider, useNotifications } from "@/components/notifications-context";
import { Avatar } from "@/components/avatar";
import { InlineSpinner } from "@/components/spinner";
import { WingMark } from "@/components/auth-shell";
import {
  BellIcon,
  CommunitiesIcon,
  HomeIcon,
  MessagesIcon,
  PlusIcon,
  RidesIcon,
} from "@/components/icons";

const TABS = [
  { href: "/app", label: "Today", icon: HomeIcon },
  { href: "/app/rides", label: "Rides", icon: RidesIcon },
  { href: "/app/communities", label: "Communities", icon: CommunitiesIcon },
  { href: "/app/messages", label: "Messages", icon: MessagesIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "guest") router.replace("/login");
    if (status === "authed") {
      // Establish the socket when a session exists. Reconnects are handled by
      // socket.io itself; token rotation rebuilds the instance in getSocket().
      try {
        getSocket();
      } catch {
        // No token yet — the next render cycle will connect.
      }
    }
  }, [status, router]);

  if (status === "loading" || status === "guest") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <InlineSpinner />
      </div>
    );
  }

  const username = user?.username ?? "";

  return (
    <NotificationsProvider>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
        <Header username={username} />
        <main className="flex-1 pb-32">{children}</main>
        <BottomNav />
      </div>
    </NotificationsProvider>
  );
}

function Brand() {
  return (
    <Link href="/app" className="flex shrink-0 items-center gap-2" aria-label="RideWing home">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
        <WingMark className="h-5 w-5" />
      </span>
      <span className="hidden text-sm font-bold tracking-tight text-zinc-900 sm:block dark:text-zinc-50">
        RideWing
      </span>
    </Link>
  );
}

function Header({ username }: { username: string }) {
  const { unreadCount } = useNotifications();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/70">
      <div className="flex items-center justify-between">
        <Brand />

        <div className="flex items-center gap-0.5">
          <Link
            href="/app/rides/new"
            className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
            aria-label="Start a ride"
          >
            <PlusIcon size={20} />
          </Link>
          <Link
            href="/app/notifications"
            className="relative grid h-9 w-9 place-items-center rounded-xl text-zinc-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:text-zinc-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
            aria-label="Notifications"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <Link
            href={`/app/profile/${username}`}
            aria-label="Your profile"
            className="ml-1 grid h-9 w-9 place-items-center rounded-xl ring-1 ring-zinc-200/70 transition-shadow hover:ring-emerald-500/60 dark:ring-zinc-700/70"
          >
            <Avatar name={username} username={username} size={28} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const active = useMemo(
    () =>
      TABS.find((tab) =>
        tab.href === "/app" ? pathname === "/app" : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
      ),
    [pathname],
  );

  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex w-full max-w-sm items-center justify-between gap-1 rounded-2xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-lg shadow-zinc-950/10 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-black/40">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive = active?.href === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              <Icon size={21} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}