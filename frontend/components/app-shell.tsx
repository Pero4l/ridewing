"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import { registerServiceWorker } from "@/lib/push";
import { NotificationsProvider, useNotifications } from "@/components/notifications-context";
import { Avatar } from "@/components/avatar";
import { InlineSpinner } from "@/components/spinner";
import { WingMark } from "@/components/auth-shell";
import type { Me } from "@/lib/types";
import {
  BellIcon,
  CogIcon,
  CommunitiesIcon,
  HomeIcon,
  MessagesIcon,
  PlusIcon,
  RidesIcon,
  ShieldIcon,
  SupportIcon,
} from "@/components/icons";

const CREATE_HREF = "/app/posts/new";

/**
 * An admin gets one extra destination. It is rendered only for admins rather
 * than hidden with CSS, so the link is absent from the DOM for everyone else.
 */
const ADMIN_HREF = "/app/admin";

const TABS = [
  { href: "/app", label: "Today", icon: HomeIcon },
  { href: "/app/rides", label: "Rides", icon: RidesIcon },
  { href: "/app/communities", label: "Communities", icon: CommunitiesIcon },
  { href: CREATE_HREF, label: "New post", icon: PlusIcon },
  { href: "/app/messages", label: "Messages", icon: MessagesIcon },
  { href: "/app/support", label: "Support", icon: SupportIcon },
  { href: "/app/settings", label: "Settings", icon: CogIcon },
];

/**
 * The routes a signed-out visitor may read.
 *
 * Feed, profiles and a single post are the pages people send links to, so they
 * are the ones that have to work without an account. Everything else needs a
 * session and is bounced to /login. This list is the single place that decides,
 * so a new route is private by default and has to be named here on purpose.
 */
const PUBLIC_PATHS: Array<string | RegExp> = [
  "/app",
  "/app/posts",
  /^\/app\/posts\/[^/]+$/,
  /^\/app\/profile\/[^/]+$/,
];

/**
 * Exact matches only. A string rule covers the path itself and nothing below
 * it — "/app/posts" is a public *page*, but "/app/posts/new" is a private
 * composer, and treating the public entry as a subtree would expose every
 * private route underneath it. The regex rules express subtrees themselves,
 * where that is genuinely wanted.
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((rule) => (typeof rule === "string" ? pathname === rule : rule.test(pathname)));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const guest = status === "guest";
  const allowed = !guest || isPublicPath(pathname);

  useEffect(() => {
    if (status === "guest" && !isPublicPath(pathname)) router.replace("/login");
    if (status === "authed") {
      // Establish the socket when a session exists. Reconnects are handled by
      // socket.io itself; token rotation rebuilds the instance in getSocket().
      try {
        getSocket();
      } catch {
        // No token yet — the next render cycle will connect.
      }
      // The worker has to exist before a push can ever arrive, so it is
      // registered on every authenticated boot rather than only when the rider
      // first visits the settings toggle.
      void registerServiceWorker();
    }
  }, [status, pathname, router]);

  // Tapping a push notification focuses this tab and asks us where to go. The
  // service worker cannot know the in-app route for every notification type, so
  // it hands the URL over and we navigate with the router.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== "ridewing:navigate" || typeof data.url !== "string") return;
      if (!data.url.startsWith("/")) return;
      router.push(data.url);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [router]);

  if (status === "loading" || !allowed) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <InlineSpinner />
      </div>
    );
  }

  return (
    <NotificationsProvider>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
        <Header user={user} />
        <main className="flex-1 pb-32">{children}</main>
        <BottomNav guest={guest} />
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

function Header({ user }: { user: Me | null }) {
  const { unreadCount } = useNotifications();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/70">
      <div className="flex items-center justify-between">
        <Brand />

        {user ? (
          <div className="flex items-center gap-0.5">
            {user.role === "admin" && (
              <Link
                href={ADMIN_HREF}
                aria-label="Admin"
                className="grid h-9 w-9 place-items-center rounded-xl text-zinc-500 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-zinc-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
              >
                <ShieldIcon size={20} />
              </Link>
            )}
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
              href={`/app/profile/${user.username}`}
              aria-label="Your profile"
              className="ml-1 grid h-9 w-9 place-items-center rounded-xl ring-1 ring-zinc-200/70 transition-shadow hover:ring-emerald-500/60 dark:ring-zinc-700/70"
            >
              <Avatar name={user.displayName} username={user.username} image={user.profileImage} size={28} />
            </Link>
          </div>
        ) : (
          // A guest gets the one action that matters: an account. Everything
          // else on this chrome is write-only, so it is not rendered at all
          // rather than shown disabled.
          <Link
            href="/register"
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/30 transition-colors hover:bg-emerald-700"
          >
            Join RideWing
          </Link>
        )}
      </div>
    </header>
  );
}

function BottomNav({ guest }: { guest: boolean }) {
  const pathname = usePathname();
  const { messageUnread } = useNotifications();
  // Only surfaces a guest can actually reach. Offering Messages, Rides or
  // Settings would just bounce to /login, so a signed-out visitor sees the feed
  // and a single sign-in call to action instead of seven dead ends.
  const tabs = guest ? TABS.filter((tab) => tab.href === "/app") : TABS;
  const active = useMemo(
    () =>
      tabs.find((tab) =>
        tab.href === "/app" ? pathname === "/app" : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
      ),
    [pathname, tabs],
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="flex w-full max-w-sm items-center justify-between gap-1 rounded-2xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-lg shadow-zinc-950/10 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-black/40">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = active?.href === href;
          const isMessages = href === "/app/messages";
          const isCreate = href === CREATE_HREF;
          if (isCreate) {
            return (
              <Link
                key={href}
                href={href}
                aria-label="New post"
                className="grid min-w-0 flex-1 place-items-center"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/30 transition-transform hover:scale-105">
                  <PlusIcon size={24} />
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              {isMessages && messageUnread > 0 && (
                <span className="absolute right-1/2 top-0.5 mr-[-14px] grid h-4 min-w-4 translate-x-1/2 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {messageUnread > 9 ? "9+" : messageUnread}
                </span>
              )}
              <Icon size={21} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}