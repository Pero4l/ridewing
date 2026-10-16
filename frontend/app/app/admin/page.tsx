"use client";
/* eslint-disable react-hooks/set-state-in-effect --
 * Admin panels fetch on mount and on filter/page changes. Each effect only
 * *starts* an async fetch; the setState calls land after an `await`, but the
 * initial setLoading(true) is synchronous so the rule flags the helper.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { InlineSpinner } from "@/components/spinner";
import {
  BellIcon,
  CheckIcon,
  CommunitiesIcon,
  DotsHorizontalIcon,
  HomeIcon,
  MessagesIcon,
  RidesIcon,
  SearchIcon,
  ShieldIcon,
  SupportIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";
import { timeAgo } from "@/lib/format";
import type { AdminActivity, AdminStats, AdminUser, SupportTicket } from "@/lib/types";

type Tab = "overview" | "users" | "activity" | "support";

const TABS: { id: Tab; label: string; icon: (p: { size?: number; className?: string }) => React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: (p) => <HomeIcon {...p} /> },
  { id: "users", label: "Users", icon: (p) => <UserIcon {...p} /> },
  { id: "activity", label: "Activity", icon: (p) => <BellIcon {...p} /> },
  { id: "support", label: "Support", icon: (p) => <SupportIcon {...p} /> },
];

function actionLabel(action: string): string {
  return action
    .replace(/^user\./, "")
    .replace(/\./g, " ")
    .replace(/_/g, " ");
}

export default function AdminPage() {
  const { status, user } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (status === "authed" && user && user.role !== "admin") {
      router.replace("/app");
    }
  }, [status, user, router]);

  if (status === "loading") {
    return (
      <div className="grid place-items-center py-24">
        <InlineSpinner />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="px-4 py-10">
        <EmptyState
          icon={<ShieldIcon size={32} />}
          title="Admins only"
          description="This console is restricted to RideWing administrators. If you need help, contact support."
          action={
            <Link href="/app/support">
              <Button size="sm" variant="secondary">
                Contact support
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="pb-10">
      {/* ── Dashboard header ─────────────────────────────────── */}
      <PageHeader>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-md shadow-orange-500/25">
          <ShieldIcon size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Admin console
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Moderate riders, review reports and keep the road safe.
          </p>
        </div>
        <Link href="/app/support">
          <Button variant="secondary" size="sm">
            <SupportIcon size={16} />
            <span className="hidden sm:inline">Support queue</span>
          </Button>
        </Link>
      </PageHeader>

      {/* ── Tab bar ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-y border-zinc-200/70 bg-white/85 px-4 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex gap-1 overflow-x-auto py-2" role="tablist" aria-label="Admin sections">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                <Icon size={17} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-5">
        {tab === "overview" && <Overview onGo={setTab} />}
        {tab === "users" && <UsersPanel toast={toast} />}
        {tab === "activity" && <ActivityPanel />}
        {tab === "support" && <SupportPanel />}
      </div>
    </div>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function Overview({ onGo }: { onGo: (tab: Tab) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recent, setRecent] = useState<AdminActivity[] | null>(null);
  const [openTickets, setOpenTickets] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, a, t] = await Promise.all([
        api.get<AdminStats>("/api/admin/stats"),
        api.get<{ activity: AdminActivity[] }>("/api/admin/activity?limit=6&page=1"),
        api.get<{ tickets: SupportTicket[] }>("/api/support/admin/tickets?status=open"),
      ]);
      setStats(s);
      setRecent(a.activity);
      setOpenTickets(t.tickets.length);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the dashboard.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!stats && !error) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-4 h-7 w-16 rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-2 h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<ShieldIcon size={32} />}
        title="Dashboard unavailable"
        description={error}
        action={
          <Button size="sm" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const cards = [
    { label: "Total riders", value: stats!.usersTotal, icon: <CommunitiesIcon size={18} />, tone: "bg-sky-500", sub: `${stats!.usersActive} active` },
    { label: "Suspended", value: stats!.usersSuspended, icon: <XIcon size={18} />, tone: "bg-red-500", sub: "needs review" },
    { label: "Live rides", value: stats!.ridesActive, icon: <RidesIcon size={18} />, tone: "bg-emerald-500", sub: "happening now" },
    { label: "Posts", value: stats!.postsTotal, icon: <MessagesIcon size={18} />, tone: "bg-violet-500", sub: "all time" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className={`grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm ${c.tone}`}>
              {c.icon}
            </div>
            <p className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
              {c.value.toLocaleString()}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{c.label}</p>
            <p className="text-xs text-zinc-400">{c.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Quick actions */}
        <Card className="p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Quick actions</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => onGo("users")}
              className="rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:border-zinc-700 dark:hover:bg-emerald-950/30"
            >
              <UserIcon size={18} className="text-emerald-600" />
              <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">Review users</p>
              <p className="text-xs text-zinc-500">Suspend · roles · sessions</p>
            </button>
            <button
              onClick={() => onGo("support")}
              className="rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:border-amber-500/50 hover:bg-amber-50/50 dark:border-zinc-700 dark:hover:bg-amber-950/30"
            >
              <SupportIcon size={18} className="text-amber-600" />
              <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Support {openTickets !== null && openTickets > 0 ? `(${openTickets})` : ""}
              </p>
              <p className="text-xs text-zinc-500">Resolve open tickets</p>
            </button>
            <button
              onClick={() => onGo("activity")}
              className="rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:border-sky-500/50 hover:bg-sky-50/50 dark:border-zinc-700 dark:hover:bg-sky-950/30"
            >
              <BellIcon size={18} className="text-sky-600" />
              <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">Audit log</p>
              <p className="text-xs text-zinc-500">Who did what, when</p>
            </button>
            <Link
              href="/app/support"
              className="rounded-xl border border-zinc-200 p-3 transition-colors hover:border-zinc-400 dark:border-zinc-700"
            >
              <CheckIcon size={18} className="text-zinc-500" />
              <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">Full queue</p>
              <p className="text-xs text-zinc-500">Open support page</p>
            </Link>
          </div>
        </Card>

        {/* Recent activity */}
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Recent activity</h2>
            <button onClick={() => onGo("activity")} className="text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400">
              View all →
            </button>
          </div>
          <div className="divide-y divide-zinc-100 px-5 pb-4 dark:divide-zinc-800">
            {(recent ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">No admin actions recorded yet.</p>
            ) : (
              recent!.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <ShieldIcon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {a.adminUsername} · {actionLabel(a.action)}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {a.targetUsername ? `@${a.targetUsername} · ` : ""}
                      {timeAgo(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Users ──────────────────────────────────────────────────────────────────

function UsersPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const { user: me } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "rider" | "admin">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-action busy key (`${userId}:${action}`) so only the tapped button
  // spins — a row-level flag lit up every button in the row at once.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const fetchUsers = useCallback(async (pageNum: number, status: string, role: string, query: string) => {
    const params = new URLSearchParams({ limit: "20", page: String(pageNum) });
    if (status !== "all") params.set("status", status);
    if (role !== "all") params.set("role", role);
    if (query) params.set("q", query);
    return api.get<{ users: AdminUser[]; total: number; pages: number }>(
      `/api/admin/users?${params.toString()}`,
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchUsers(page, statusFilter, roleFilter, debouncedQ);
      setUsers(res.users);
      setTotal(res.total);
      setPages(res.pages || 1);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, roleFilter, debouncedQ, fetchUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  // Background refresh after a mutation: updates rows without flashing the
  // full-screen spinner over a list the admin is looking at.
  const refreshQuiet = useCallback(async () => {
    try {
      const res = await fetchUsers(page, statusFilter, roleFilter, debouncedQ);
      setUsers(res.users);
      setTotal(res.total);
      setPages(res.pages || 1);
    } catch {
      // The row already shows the mutation result; a stale list is fine.
    }
  }, [page, statusFilter, roleFilter, debouncedQ, fetchUsers]);

  async function mutate(
    id: string,
    action: "unsuspend" | "role" | "revoke",
    fn: () => Promise<{ user: AdminUser } | { ok: boolean }>,
    success: string,
  ) {
    const key = `${id}:${action}`;
    setBusyKey(key);
    try {
      const res = await fn();
      if ("user" in res) {
        setUsers((list) => list.map((u) => (u.id === id ? (res.user as AdminUser) : u)));
      } else {
        void refreshQuiet();
      }
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusyKey((k) => (k === key ? null : k));
    }
  }

  const suspend = (u: AdminUser) => {
    setSuspendTarget(u);
    setSuspendReason("");
  };

  async function confirmSuspend() {
    if (!suspendTarget) return;
    const target = suspendTarget;
    const key = `${target.id}:suspend`;
    setBusyKey(key);
    try {
      const res = await api.post<{ user: AdminUser }>(`/api/admin/users/${target.id}/suspend`, {
        reason: suspendReason.trim() || undefined,
      });
      setUsers((list) => list.map((u) => (u.id === target.id ? res.user : u)));
      toast.success(`@${target.username} suspended — signed out everywhere`);
      setSuspendTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not suspend user.");
    } finally {
      setBusyKey((k) => (k === key ? null : k));
    }
  }

  async function confirmRoleChange() {
    if (!roleTarget) return;
    const target = roleTarget;
    const nextRole = target.role === "admin" ? "rider" : "admin";
    const key = `${target.id}:role`;
    setBusyKey(key);
    try {
      const res = await api.patch<{ user: AdminUser }>(`/api/admin/users/${target.id}/role`, {
        role: nextRole,
      });
      setUsers((list) => list.map((u) => (u.id === target.id ? res.user : u)));
      toast.success(
        nextRole === "admin" ? `@${target.username} is now an admin` : `@${target.username} is now a rider`,
      );
      setRoleTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change role.");
    } finally {
      setBusyKey((k) => (k === key ? null : k));
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 focus-within:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900">
            <SearchIcon size={17} className="shrink-0 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search username, name or email…"
              aria-label="Search users"
              className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search" className="text-zinc-400 hover:text-zinc-600">
                <XIcon size={15} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }} aria-label="Filter by status" className="w-auto">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
            <Select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as typeof roleFilter); setPage(1); }} aria-label="Filter by role" className="w-auto">
              <option value="all">All roles</option>
              <option value="rider">Riders</option>
              <option value="admin">Admins</option>
            </Select>
          </div>
        </div>
        <p className="text-xs text-zinc-400">
          {total.toLocaleString()} rider{total === 1 ? "" : "s"} · page {page} of {pages}
        </p>
      </Card>

      {loading ? (
        <div className="grid place-items-center py-16">
          <InlineSpinner />
        </div>
      ) : error ? (
        <EmptyState
          icon={<XIcon size={28} />}
          title="Could not load users"
          description={error}
          action={
            <Button size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UserIcon size={28} />}
          title="No users match"
          description="Try clearing the search or choosing different filters."
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { setQ(""); setStatusFilter("all"); setRoleFilter("all"); setPage(1); }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-400 dark:border-zinc-800">
                  <th className="px-4 py-3 font-semibold">Rider</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {users.map((u) => (
                  <UserTableRow
                    key={u.id}
                    user={u}
                    isSelf={me?.id === u.id}
                    busyKey={busyKey}
                    expanded={expandedId === u.id}
                    onToggle={() => setExpandedId((id) => (id === u.id ? null : u.id))}
                    onSuspend={() => suspend(u)}
                    onUnsuspend={() => void mutate(u.id, "unsuspend", () => api.post<{ user: AdminUser }>(`/api/admin/users/${u.id}/unsuspend`), `@${u.username} reinstated — they can sign in again`)}
                    onRole={() => setRoleTarget(u)}
                    onRevoke={() =>
                      void mutate(u.id, "revoke", () => api.post<{ ok: boolean }>(`/api/admin/users/${u.id}/revoke-sessions`), `All sessions revoked for @${u.username}`)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {users.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                isSelf={me?.id === u.id}
                busyKey={busyKey}
                expanded={expandedId === u.id}
                onToggle={() => setExpandedId((id) => (id === u.id ? null : u.id))}
                onSuspend={() => suspend(u)}
                onUnsuspend={() => void mutate(u.id, "unsuspend", () => api.post<{ user: AdminUser }>(`/api/admin/users/${u.id}/unsuspend`), `@${u.username} reinstated — they can sign in again`)}
                onRole={() => setRoleTarget(u)}
                onRevoke={() =>
                  void mutate(u.id, "revoke", () => api.post<{ ok: boolean }>(`/api/admin/users/${u.id}/revoke-sessions`), `All sessions revoked for @${u.username}`)
                }
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-zinc-400">
              Showing {users.length} of {total.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                ← Prev
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Suspend dialog */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`Suspend @${suspendTarget.username}`}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Suspend @{suspendTarget.username}?
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              They will be signed out everywhere immediately and cannot sign back in until reinstated.
            </p>
            <div className="mt-4">
              <Field label="Reason (optional, visible to audit log)" hint="Max 500 characters">
                <Textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Spam, harassment, …"
                  maxLength={500}
                  rows={3}
                />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" full onClick={() => setSuspendTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" full loading={busyKey === `${suspendTarget.id}:suspend`} onClick={confirmSuspend}>
                Suspend rider
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Role-change confirm dialog */}
      {roleTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`Change role for @${roleTarget.username}`}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {roleTarget.role === "admin"
                ? `Demote @${roleTarget.username} to rider?`
                : `Make @${roleTarget.username} an admin?`}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {roleTarget.role === "admin"
                ? "They will lose access to this console immediately. The last admin cannot be demoted."
                : "They will gain full access to this console: suspend users, change roles and resolve tickets."}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" full onClick={() => setRoleTarget(null)}>
                Cancel
              </Button>
              <Button
                variant={roleTarget.role === "admin" ? "danger" : "primary"}
                full
                loading={busyKey === `${roleTarget.id}:role`}
                onClick={confirmRoleChange}
              >
                {roleTarget.role === "admin" ? "Demote to rider" : "Make admin"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function RoleBadge({ role }: { role: string }) {
  return <Badge tone={role === "admin" ? "blue" : "zinc"}>{role === "admin" ? "Admin" : "Rider"}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "suspended" ? "red" : "green"}>{status === "suspended" ? "Suspended" : "Active"}</Badge>;
}

function UserActions({
  user,
  isSelf,
  busyKey,
  onSuspend,
  onUnsuspend,
  onRole,
  onRevoke,
}: {
  user: AdminUser;
  isSelf: boolean;
  busyKey: string | null;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onRole: () => void;
  onRevoke: () => void;
}) {
  const suspended = user.status === "suspended";
  const busy = (action: string) => busyKey === `${user.id}:${action}`;
  if (isSelf) {
    return (
      <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        This is you — actions are disabled on your own account.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {suspended ? (
        <Button size="sm" variant="secondary" loading={busy("unsuspend")} onClick={onUnsuspend}>
          Reinstate
        </Button>
      ) : (
        <Button size="sm" variant="danger" loading={busy("suspend")} onClick={onSuspend}>
          Suspend
        </Button>
      )}
      <Button size="sm" variant="secondary" loading={busy("role")} onClick={onRole}>
        {user.role === "admin" ? "Make rider" : "Make admin"}
      </Button>
      <Button size="sm" variant="ghost" loading={busy("revoke")} onClick={onRevoke} title="Sign them out everywhere">
        Revoke sessions
      </Button>
    </div>
  );
}

function UserTableRow(props: {
  user: AdminUser;
  isSelf: boolean;
  busyKey: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onRole: () => void;
  onRevoke: () => void;
}) {
  const { user: u } = props;
  return (
    <>
      <tr className="align-middle hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar name={u.displayName} username={u.username} image={u.profileImage} size={36} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                {u.displayName}{" "}
                {props.isSelf && (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    You
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-zinc-400">@{u.username} · {u.email ?? "no email"}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <RoleBadge role={u.role} />
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={u.status} />
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">{timeAgo(u.createdAt)}</td>
        <td className="px-4 py-3">
          <div className="flex justify-end">
            <button
              onClick={props.onToggle}
              aria-label={props.expanded ? "Collapse" : "Expand"}
              className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
            >
              <DotsHorizontalIcon size={18} />
            </button>
          </div>
        </td>
      </tr>
      {props.expanded && (
        <tr className="bg-zinc-50/60 dark:bg-zinc-800/30">
          <td colSpan={5} className="px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-xs text-zinc-500">
                <p>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">ID:</span> {u.id}
                </p>
                {u.suspensionReason && (
                  <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    Suspended: {u.suspensionReason}
                  </p>
                )}
                <p className="mt-1">
                  Last seen {u.lastSeenAt ? timeAgo(u.lastSeenAt) : "never"} · joined {timeAgo(u.createdAt)}
                </p>
              </div>
              <UserActions user={u} isSelf={props.isSelf} busyKey={props.busyKey} onSuspend={props.onSuspend} onUnsuspend={props.onUnsuspend} onRole={props.onRole} onRevoke={props.onRevoke} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UserCard(props: {
  user: AdminUser;
  isSelf: boolean;
  busyKey: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onRole: () => void;
  onRevoke: () => void;
}) {
  const { user: u } = props;
  return (
    <Card className="p-4">
      <button onClick={props.onToggle} className="flex w-full items-center gap-3 text-left">
        <Avatar name={u.displayName} username={u.username} image={u.profileImage} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-zinc-900 dark:text-zinc-100">
            {u.displayName}{" "}
            {props.isSelf && (
              <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                You
              </span>
            )}
          </p>
          <p className="truncate text-xs text-zinc-400">@{u.username}</p>
          <div className="mt-1.5 flex gap-1.5">
            <RoleBadge role={u.role} />
            <StatusBadge status={u.status} />
          </div>
        </div>
      </button>
      {props.expanded && (
        <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            {u.email ?? "no email"}
            {u.suspensionReason ? ` · Suspended: ${u.suspensionReason}` : ""}
          </p>
          <UserActions user={u} isSelf={props.isSelf} busyKey={props.busyKey} onSuspend={props.onSuspend} onUnsuspend={props.onUnsuspend} onRole={props.onRole} onRevoke={props.onRevoke} />
        </div>
      )}
    </Card>
  );
}

// ─── Activity ───────────────────────────────────────────────────────────────

function ActivityPanel() {
  const [items, setItems] = useState<AdminActivity[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ activity: AdminActivity[]; total: number; pages: number }>(
        `/api/admin/activity?limit=25&page=${page}`,
      );
      setItems(res.activity);
      setTotal(res.total);
      setPages(res.pages || 1);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <InlineSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<BellIcon size={28} />}
        title="Activity unavailable"
        description={error}
        action={
          <Button size="sm" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BellIcon size={28} />}
        title="No activity yet"
        description="Admin actions — role changes, suspensions, session revocations — will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">
        {total.toLocaleString()} action{total === 1 ? "" : "s"} · page {page} of {pages}
      </p>
      <div className="relative ml-2 space-y-0 border-l-2 border-zinc-100 pl-0 dark:border-zinc-800">
        {items.map((a) => (
          <div key={a.id} className="relative flex gap-3 pb-4 pl-6">
            <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500 shadow dark:border-zinc-950" />
            <Card className="flex-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">{actionLabel(a.action)}</Badge>
                <span className="text-xs text-zinc-400">{timeAgo(a.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">@{a.adminUsername}</span>
                {a.targetUsername ? (
                  <>
                    {" → "}
                    <span className="font-semibold">@{a.targetUsername}</span>
                  </>
                ) : null}
              </p>
              {a.metadata && Object.keys(a.metadata).length > 0 && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {JSON.stringify(a.metadata, null, 2)}
                </pre>
              )}
            </Card>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ← Newer
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Older →
        </Button>
      </div>
    </div>
  );
}

// ─── Support ────────────────────────────────────────────────────────────────

function SupportPanel() {
  const toast = useToast();
  const [open, setOpen] = useState<SupportTicket[]>([]);
  const [resolved, setResolved] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, r] = await Promise.all([
        api.get<{ tickets: SupportTicket[] }>("/api/support/admin/tickets?status=open"),
        api.get<{ tickets: SupportTicket[] }>("/api/support/admin/tickets?status=resolved"),
      ]);
      setOpen(o.tickets);
      setResolved(r.tickets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the support queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(() => open.length, [open]);

  async function resolveTicket(id: string) {
    if (resolvingId) return;
    setResolvingId(id);
    try {
      const note = notes[id]?.trim();
      await api.put(`/api/support/admin/tickets/${id}/resolve`, note ? { note } : {});
      toast.success("Ticket resolved");
      setNotes((n) => {
        const next = { ...n };
        delete next[id];
        return next;
      });
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resolve ticket.");
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <InlineSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<SupportIcon size={28} />}
        title="Queue unavailable"
        description={error}
        action={
          <Button size="sm" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
          Open tickets {openCount > 0 ? `(${openCount})` : ""}
        </h2>
        <Link href="/app/support" className="text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400">
          Open full support page →
        </Link>
      </div>

      {open.length === 0 ? (
        <EmptyState
          icon={<CheckIcon size={28} />}
          title="Queue is clear"
          description="No open tickets. Nice work."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {open.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-zinc-900 dark:text-zinc-100">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {t.creator?.displayName ?? "Someone"} · @{t.creator?.username ?? "unknown"} · {timeAgo(t.createdAt)}
                  </p>
                </div>
                <Badge tone="amber">Open</Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.body}</p>
              <div className="mt-3 space-y-2">
                <Textarea
                  value={notes[t.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                  placeholder="Resolution note (optional)"
                  maxLength={1000}
                  rows={2}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  full
                  loading={resolvingId === t.id}
                  onClick={() => void resolveTicket(t.id)}
                >
                  Mark as resolved
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="pb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">Recently resolved</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {resolved.slice(0, 6).map((t) => (
              <Card key={t.id} className="p-4 opacity-80">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{t.subject}</p>
                  <Badge tone="green">Resolved</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{t.body}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  Resolved {t.resolvedAt ? timeAgo(t.resolvedAt) : ""}
                  {t.resolver ? ` by @${t.resolver.username}` : ""}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
