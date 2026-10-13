"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useState as useUseState } from "react";
import { ShieldIcon, UserIcon, TrashIcon, CheckIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui";

export default function AdminPage() {
  const [section, setSection] = useState("stats");

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
        {section === "stats" && <p className="p-4">Stats section - total users, active users, total rides</p>}
        {section === "users" && <p className="p-4">Users section - manage users, roles, suspensions</p>}
        {section === "activity" && <p className="p-4">Activity section - admin logs</p>}
      </main>
    </div>
  );
}
