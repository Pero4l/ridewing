"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth";
import { CogIcon, LogOutIcon, MicIcon, SupportIcon, VideoIcon } from "@/components/icons";
import { BrandMark, BrandName, GrandcrestCredit } from "@/components/brand";
import { Button, Card, PageHeader, SectionTitle } from "@/components/ui";
import { useToast } from "@/components/toast";

export default function MorePage() {
  const { logout } = useSession();
  const toast = useToast();

  async function handleLogout() {
    try {
      await logout();
      toast.success("Signed out");
    } catch {
      toast.error("Could not sign out");
    }
  }

  return (
    <div>
      <PageHeader>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">More</h1>
      </PageHeader>

      <div className="space-y-2.5 px-4 pb-4 pt-1">
        <SectionTitle>Features</SectionTitle>
        <div className="space-y-2.5">
          <Link href="/app/reels" className="block">
            <Card padded={false} className="active:bg-zinc-50 dark:active:bg-zinc-900">
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  <VideoIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">Reels</p>
                  <p className="text-sm text-zinc-400">Watch short videos from riders</p>
                </div>
              </div>
            </Card>
          </Link>
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

      <div className="border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
        <SectionTitle>Account</SectionTitle>
        <Button full variant="danger" onClick={handleLogout} className="mt-2">
          <LogOutIcon size={16} className="mr-2" />
          Sign out
        </Button>
      </div>

      {/*
       * Attribution lives at the bottom of the app's own "More" screen as well
       * as on the marketing and auth pages, so the company that built RideWing is
       * credited to a signed-in rider too and not only to a visitor.
       */}
      <div className="flex flex-col items-center gap-3 border-t border-zinc-100 px-4 py-6 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-7 rounded-lg" />
          <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            <BrandName />
          </span>
        </div>
        <GrandcrestCredit />
      </div>
    </div>
  );
}