"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-fetch";
import { Button, EmptyState } from "@/components/ui";
import { ShieldIcon, UserIcon, TrashIcon, CheckIcon } from "@/components/icons";
import { Avatar } from "@/components/avatar";

export default function AdminPage() {
  const [section, setSection] = useState<"stats" | "users" | "activity">("stats");

  // --- Stats ---
  const stats = useApi(() => api.get("/api/admin/stats"), []) as any;
  useEffect(() => {
    void stats.reload();
  }, [section === "stats" ? 1 : 0]);

  // --- Users list ---
  const usersList = useApi(() => api.get("/api/admin/users"), []);
  useEffect(() => {
    void usersList.reload();
  }, [section === "users" ? 1 : 0]);

  // --- Activity ---
  const activity = useApi(() => api.get("/api/admin/activity"), []);
  useEffect(() => {
    void activity.reload();
  }, [section === "activity" ? 1 : 0]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <ShieldIcon className="h-6 w-6 text-zinc-400" />
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Admin Dashboard</h1>
      </div>

      <nav className="flex gap-2 mb-6">
        <Button
          variant="ghost"
          onClick={() => setSection("stats")}
          className={section === "stats" ? "bg-amber-50 text-amber-700" : ""}
        >
          Stats
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSection("users")}
          className={section === "users" ? "bg-amber-50 text-amber-700" : ""}
        >
          Users {(stats.data as any)?.usersTotal ?? 0}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSection("activity")}
          className={section === "activity" ? "bg-amber-50 text-amber-700" : ""}
        >
          Activity
        </Button>
      </nav>

      {/* STATS SECTION */}
      {section === "stats" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.loading && (
            <div className="col-span-full py-8 text-center">
              <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
            </div>
          )}
          {stats.error && (
            <div className="col-span-full py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{stats.error}</div>
          )}
          {stats.data && !stats.loading && (
            <div>
              <div className="p-4 rounded-xl border border-zinc-200/50 bg-zinc-50 dark:border-zinc-800/50 dark:bg-zinc-950/50">
                <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{((stats.data as any)?.usersTotal ?? 0)}</div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">Total Users</div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200/50 bg-zinc-50 dark:border-zinc-800/50 dark:bg-zinc-950/50">
                <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{((stats.data as any)?.usersActive ?? 0)}</div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">Active</div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-200/50 bg-zinc-50 dark:border-zinc-800/50 dark:bg-zinc-950/50">
                <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{((stats.data as any)?.ridesActive ?? 0)}</div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">Total Rides</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* USERS SECTION */}
      {section === "users" && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <select
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                void usersList.reload();
              }}
              className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 bg-white/20 placeholder-zinc-400 dark:text-zinc-300 flex-1"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="all">All</option>
            </select>
            <select
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                void usersList.reload();
              }}
              className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 bg-white/20 placeholder-zinc-400 dark:text-zinc-300"
            >
              <option value="rider">Riders</option>
              <option value="admin">Admins</option>
              <option value="all">All</option>
            </select>
            <input
              type="text"
              placeholder="Search users..."
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 bg-white/20 placeholder-zinc-400 dark:text-zinc-300"
              onChange={(e) => {
                void usersList.reload();
              }}
            />
            <Button variant="ghost" onClick={() => {}}>Create User</Button>
          </div>

          {usersList.loading && (
            <div className="grid place-items-center py-8">
              <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
            </div>
          )}
          {usersList.error && (
            <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{usersList.error}</p>
          )}
          {usersList.data && (usersList.data as any).items.length ? (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(usersList.data as any).items.map((user: any) => {
                return (
                  <div
                    key={user.id}
                    className="p-4 rounded-xl border rounded border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/50"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={user.displayName} username={user.username} image={user.profileImage} size={32} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate line-clamp-1">
                          {user.displayName || user.username}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {user.email || user.phone || "—"}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:text-amber-400">
                          {user.role}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-900/30 dark:text-zinc-400">
                          {user.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {user.id && (
                        <Button onClick={() => {}} title="Change role">
                          <ShieldIcon size={16} />
                        </Button>
                      )}
                      {user.status !== "suspended" && (
                        <Button onClick={() => {}} title="Suspend">
                          <TrashIcon size={16} />
                        </Button>
                      )}
                      {user.status === "active" && (
                        <Button onClick={() => {}} title="Unsuspend">
                          <CheckIcon size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<UserIcon size={32} />}
              title={usersList.data && (usersList.data as any).items.length === 0 ? "No users found" : "Loading users"}
              description={
                usersList.data && (usersList.data as any).items.length === 0
                  ? "No users match your filters"
                  : "No users"
              }
            />
          )}
        </div>
      )}

      {/* ACTIVITY SECTION */}
      {section === "activity" && (
        <div>
          {activity.loading && (
            <div className="grid place-items-center py-8">
              <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
            </div>
          )}
          {activity.error && (
            <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{activity.error}</p>
          )}
          {activity.data && (activity.data as any).items.length ? (
            <div className="space-y-3 max-h-96 overflow-y-auto px-2">
              {(activity.data as any).items.map((log: any) => {
                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border rounded border-zinc-200/50 bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:border-zinc-200/50 bg-amber-50/50 dark:bg-amber-900/20"
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate line-clamp-1">
                          {log.description}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{log.timestamp}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No activity"
              description="No admin activity logged yet"
            />
          )}
        </div>
      )}
    </div>
  );
}