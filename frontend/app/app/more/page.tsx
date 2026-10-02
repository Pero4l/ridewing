"use client";

import Link from "next/link";
import { CogIcon, MicIcon, SupportIcon } from "@/components/icons";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

export default function MorePage() {
  return (
    <div>
      <PageHeader>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">More</h1>
      </PageHeader>

      <div className="space-y-2.5 px-4 pb-4 pt-1">
        <SectionTitle>Features</SectionTitle>
        <div className="space-y-2.5">
          <Link href="/app/rides" className="block">
            <Card padded={false} className="active:bg-zinc-50 dark:active:bg-zinc-900">
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <MicIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Rides</p>
                  <p className="text-sm text-zinc-400">Join or start group rides with voice chat</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/app/support" className="block">
            <Card padded={false} className="active:bg-zinc-50 dark:active:bg-zinc-900">
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                  <SupportIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Support</p>
                  <p className="text-sm text-zinc-400">Get help, report issues, or send feedback</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/app/settings" className="block">
            <Card padded={false} className="active:bg-zinc-50 dark:active:bg-zinc-900">
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <CogIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Settings</p>
                  <p className="text-sm text-zinc-400">Profile, appearance, notifications, and more</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}