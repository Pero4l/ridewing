"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Badge, Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { InlineSpinner, SpinnerIcon } from "@/components/spinner";
import { BackIcon, CheckIcon, SearchIcon, ShieldIcon, XIcon } from "@/components/icons";
import { fullDateOnly } from "@/lib/format";
import type { AdminActivity, AdminStats, AdminUser } from "@/lib/types";

type Tab = "users" | "activity";

type UsersPage = {
  users: AdminUser[];
  total: number;
  page: number;
  pages: number;
};

type ActivityPage = {
  activity: AdminActivity[];
  total: number;
  page: number;
  pages: number;
};

/** How the audit log's action codes read in the console. */
const ACTION_LABELS: Record<string, string> = {
  "user.role_changed": "changed role",
  "user.suspended": "suspended",
  "user.unsuspended": "reinstated",
  "user.sessions_revoked": "signed out everywhere",
};

const SUSPEND_REASONS = ["Spam or scams", "Harassment or abuse", "Impersonation", "Repeated rule violations"];

/**
 * The moderation console.
 *
 * Everything here is a write against another rider's account, so each one is
 * deliberate: the destructive actions ask for a reason (which is what lands in
 * the audit log and is what a disputed suspension gets argued about later), and
 * the acting admin is excluded from the controls that could lock the platform
 * out of its own admin. The backend refuses all of that too — this is the part
 * where the admin is told *why* before they get the 400.
 */
export default function AdminPage() {
  const { user: me, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("users");
  const [stats, setStats] = useState<AdminStats | null>(null);

  // `/app/admin` is linked from the header for admins. A rider who types the URL
  // gets sent home rather than a list of 403s.
  useEffect(() => {
    if (status === "guest") router.replace("/login");
    if (status === "authed" && me && me.role !== "admin") router.replace("/app");
  }, [status, me, router]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await api.get<AdminStats>("/api/admin/stats"));
    } catch {
      // The tiles are context, not the page; the tabs below report their own errors.
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadStats());
  }, [loadStats]);

  if (status === "loading" || !me || me.role !== "admin") {
    return (
      <div className="grid h-dvh place-items-center">
        <InlineSpinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader>
        <button type="button" onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">
          <BackIcon size={18} />
        </button>
        <div className="flex items-center gap-2">
          <ShieldIcon size={18} className="text-amber-600 dark:text-amber-400" />
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Admin</h1>
        </div>
      </PageHeader>

      {stats && (
        <div className="grid grid-cols-3 gap-2 px-4">
          <StatTile label="Riders" value={stats.usersTotal} />
          <StatTile label="Active" value={stats.usersActive} />
          <StatTile label="Suspended" value={stats.usersSuspended} tone={stats.usersSuspended > 0 ? "red" : "zinc"} />
        </div>
      )}

      <div className="mt-4 flex items-center border-b border-zinc-100 dark:border-zinc-800">
        {(["users", "activity"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex-1 border-b-2 py-2.5 text-xs font-semibold capitalize transition-colors ${
              tab === value
                ? "border-amber-600 text-amber-700 dark:text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {value === "activity" ? "Activity" : "Riders"}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersTab me={me} /> : <ActivityTab />}
    </div>
  );
}

function StatTile({ label, value, tone = "zinc" }: { label: string; value: number; tone?: "zinc" | "red" }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className={`text-xl font-bold tabular-nums ${tone === "red" ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </p>
      <p className="truncate text-[11px] font-medium text-zinc-400">{label}</p>
    </div>
  );
}

function UsersTab({ me }: { me: AdminUser }) {
  const toast = useToast();
  const [data, setData] = useState<UsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [role, setRole] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (term.trim()) params.set("q", term.trim());
      if (role) params.set("role", role);
      if (statusFilter) params.set("status", statusFilter);
      setData(await api.get<UsersPage>(`/api/admin/users?${params.toString()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load riders");
    } finally {
      setLoading(false);
    }
  }, [page, term, role, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, term]);

  const apply = async (userId: string, action: () => Promise<unknown>, success: string) => {
    if (busyId) return;
    setBusyId(userId);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="space-y-2 px-4 py-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-zinc-400">
            <SearchIcon size={16} />
          </span>
          <Input value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }} placeholder="Search username, name or email" aria-label="Search riders" className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} aria-label="Filter by role" className="h-9 flex-1">
            <option value="">All roles</option>
            <option value="rider">Riders</option>
            <option value="admin">Admins</option>
          </Select>
          <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label="Filter by status" className="h-9 flex-1">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid place-items-center py-12"><InlineSpinner /></div>
      ) : error ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">{error}</p>
      ) : !data || data.users.length === 0 ? (
        <EmptyState title="No riders match" description="Try a different search or filter." />
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {data.users.map((user) => {
            const isSelf = user.id === me.id;
            const suspended = user.status === "suspended";
            return (
              <div key={user.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Avatar name={user.displayName} username={user.username} image={user.profileImage} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/app/profile/${user.username}`} className="truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                        {user.displayName}
                      </Link>
                      {user.role === "admin" && <Badge tone="amber">Admin</Badge>}
                      {suspended && <Badge tone="red">Suspended</Badge>}
                      {isSelf && <Badge tone="zinc">You</Badge>}
                    </div>
                    <p className="truncate text-xs text-zinc-400">
                      @{user.username} · {user.email ?? "no email"}
                    </p>
                    {suspended && user.suspensionReason && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">Reason: {user.suspensionReason}</p>
                    )}
                  </div>
                </div>

                {/*
                 * The backend refuses self-targeting and last-admin demotion, so
                 * those controls are simply not offered — an admin should not
                 * discover the rule by being told no.
                 */}
                {!isSelf && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === user.id}
                      onClick={() =>
                        void apply(
                          user.id,
                          () =>
                            api.patch(`/api/admin/users/${user.id}/role`, {
                              role: user.role === "admin" ? "rider" : "admin",
                            }),
                          user.role === "admin" ? "Demoted to rider" : "Promoted to admin",
                        )
                      }
                    >
                      {user.role === "admin" ? "Demote" : "Make admin"}
                    </Button>

                    {suspended ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === user.id}
                        onClick={() => void apply(user.id, () => api.post(`/api/admin/users/${user.id}/unsuspend`), "Reinstated")}
                      >
                        Reinstate
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setSuspending(user)}>
                        Suspend
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === user.id}
                      onClick={() => {
                        if (!window.confirm(`Sign @${user.username} out of every device?`)) return;
                        void apply(user.id, () => api.post(`/api/admin/users/${user.id}/revoke-sessions`), "Sessions revoked");
                      }}
                    >
                      Sign out everywhere
                    </Button>

                    {busyId === user.id && <SpinnerIcon size={14} className="animate-spin text-zinc-400" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between px-4 py-4 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-zinc-400">
            Page {data.page} of {data.pages} · {data.total} riders
          </span>
          <Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {suspending && <SuspendDialog user={suspending} onClose={() => setSuspending(null)} onDone={load} />}
    </div>
  );
}

/**
 * Suspension asks for a reason before it happens.
 *
 * The reason is stored on the account and written into the audit log, so it is
 * the difference between a suspension someone can appeal and one they can only
 * argue with. Suspension takes effect immediately on the API — the backend
 * revokes the account's refresh tokens as part of it — so the confirm button
 * says so rather than implying it can be undone from here.
 */
function SuspendDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [reason, setReason] = useState(SUSPEND_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const full = `${reason}${detail.trim() ? ` — ${detail.trim()}` : ""}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${user.id}/suspend`, { reason: full });
      toast.success(`@${user.username} suspended`);
      await onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not suspend");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4" role="dialog" aria-modal="true" aria-label={`Suspend @${user.username}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/50" />
      <form onSubmit={submit} className="relative w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Suspend @{user.username}</h2>
            <p className="mt-1 text-xs text-zinc-400">They are signed out everywhere and cannot sign back in until reinstated.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SUSPEND_REASONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                reason === option
                  ? "bg-red-500 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <Input
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          maxLength={400}
          placeholder="Add detail (optional)"
          aria-label="Additional detail"
        />

        <p className="text-xs text-zinc-400">Recorded reason: “{full}”</p>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            <CheckIcon size={16} /> Suspend
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * The audit log.
 *
 * Append-only and written in the same transaction as the action it describes,
 * so a line here means the action committed. This was the view that could not be
 * read at all while its table had mismatched columns.
 */
function ActivityTab() {
  const [data, setData] = useState<ActivityPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await api.get<ActivityPage>(`/api/admin/activity?page=${page}&limit=50`);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load activity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  if (loading && !data) {
    return <div className="grid place-items-center py-12"><InlineSpinner /></div>;
  }
  if (error) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">{error}</p>;
  }
  if (!data || data.activity.length === 0) {
    return <EmptyState icon={<ShieldIcon size={30} />} title="No admin actions yet" description="Suspendions, reinstatements and role changes are recorded here." />;
  }

  return (
    <div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {data.activity.map((entry) => (
          <div key={entry.id} className="px-4 py-3">
            <p className="text-sm text-zinc-800 dark:text-zinc-200">
              <span className="font-semibold">@{entry.adminUsername}</span>{" "}
              {ACTION_LABELS[entry.action] ?? entry.action}{" "}
              {entry.targetUsername ? (
                <>
                  <Link href={`/app/profile/${entry.targetUsername}`} className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                    @{entry.targetUsername}
                  </Link>
                </>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">{fullDateOnly(entry.createdAt)}</p>
            {entry.metadata && typeof entry.metadata === "object" && Object.keys(entry.metadata).length > 0 && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {Object.entries(entry.metadata)
                  .map(([key, value]) => `${key}: ${String(value)}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-between px-4 py-4 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-zinc-400">
            Page {data.page} of {data.pages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
