"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ShieldIcon, UserIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { Avatar } from "@/components/avatar";

export default function AdminPage() {
  const [section, setSection] = useState("stats");
  const [stats, setStats] = useState<Record<string, number | string> | null>(null);
  const [users, setUsers] = useState<{ id: string; displayName: string; username: string; profileImage: string | null; role?: string; suspendedAt?: string }[] | null>(null);
  const [activity, setActivity] = useState<{ id: string; action: string; createdAt: string; metadata?: string }[] | null>(null);

  useEffect(() => {
    api.get("/api/admin/stats").then((res) => setStats(res as Record<string, number | string>)).catch(() => {});
    api.get("/api/admin/users").then((res) => setUsers(res as { id: string; displayName: string; username: string; profileImage: string | null; role?: string; suspendedAt?: string }[])).catch(() => {});
    api.get("/api/admin/activity").then((res) => setActivity(res as { id: string; action: string; createdAt: string; metadata?: string }[])).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-y dark:border-zinc-800/50 bg-white/95 dark:bg-zinc-950/90 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon className="h-6 w-6 text-emerald-600" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="md" aria-label="Stats" onClick={() => setSection("stats")}>
              <ShieldIcon className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="md" aria-label="Users" onClick={() => setSection("users")}>
              <UserIcon className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="md" aria-label="Activity" onClick={() => setSection("activity")}>
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        {section === "stats" && stats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{key}</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
              </div>
            ))}
          </div>
        ) : section === "stats" && null}

        {section === "users" && users ? (
          <div className="space-y-4">
            {users.map((user) => (
              <div key={user.id} className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar name={user.displayName} username={user.username} image={user.profileImage} size={32} />
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{user.displayName}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">@{user.username}</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Role: {user.role || "rider"} · {" "}
                  {user.suspendedAt ? "Suspended" : "Active"}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {section === "activity" && activity ? (
          <div className="space-y-4">
            {activity.map((item) => (
              <div key={item.id} className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-sm">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {item.action} by admin on {new Date(item.createdAt).toLocaleDateString()}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{item.metadata || ""}</p>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
