"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-fetch";
import type { Community, Ride } from "@/lib/types";
import { CommunityRow, RideRow } from "@/components/rows";
import { Feed } from "@/components/feed";
import { Avatar } from "@/components/avatar";
import { Button, Card, EmptyState, Input, SectionTitle } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { CommunitiesIcon, SearchIcon, RidesIcon } from "@/components/icons";

export default function HomePage() {
  const { user } = useSession();

  const myCommunities = useApi<{ communities: Community[] }>(() => api.get("/api/communities/mine"), []);
  const rides = useApi<{ rides: Ride[] }>(() => api.get("/api/rides"), []);

  if (!user) return null;
  const firstName = user.displayName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <section className="flex items-center gap-3 px-4 pt-6">
        <Avatar name={user.displayName} username={user.username} image={user.profileImage} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Find a ride, catch a crew.</p>
        </div>
      </section>

      <div className="mt-4 space-y-3">
        <RiderSearch />
        <QuickActions />
      </div>

      <div className="mt-2">
        <Feed />
      </div>

      <SectionTitle>Running rides</SectionTitle>
      {rides.loading ? (
        <div className="grid place-items-center py-8">
          <InlineSpinner />
        </div>
      ) : rides.error ? (
        <ErrorNote message={rides.error} />
      ) : rides.data && rides.data.rides.length ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rides.data.rides.map((ride) => (
            <RideRow key={ride.id} ride={ride} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<RidesIcon size={32} />}
          title="No active rides"
          description="Start one, or join a ride a rider you follow has opened."
          action={
            <Link href="/app/rides/new">
              <Button size="sm">Start a ride</Button>
            </Link>
          }
        />
      )}

      <SectionTitle>Your communities</SectionTitle>
      {myCommunities.loading ? (
        <div className="grid place-items-center py-8">
          <InlineSpinner />
        </div>
      ) : myCommunities.error ? (
        <ErrorNote message={myCommunities.error} />
      ) : myCommunities.data && myCommunities.data.communities.length ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {myCommunities.data.communities.map((community) => (
            <CommunityRow key={community.slug} community={community} description />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CommunitiesIcon size={32} />}
          title="Not in any communities yet"
          description="Find riders with the same routes and habits."
          action={
            <Link href="/app/communities">
              <Button size="sm" variant="secondary">
                Browse communities
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}

function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      <Link href="/app/rides/new">
        <Card className="p-0! hover:border-emerald-500/40 hover:shadow-md hover:shadow-emerald-500/5">
          <div className="p-4">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
              <RidesIcon size={18} />
            </div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Start a ride</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Voice + live roster</p>
            <span className="mt-3 inline-block text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Go round-up →
            </span>
          </div>
        </Card>
      </Link>
      <Link href="/app/communities/new">
        <Card className="p-0! hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="p-4">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <CommunitiesIcon size={18} />
            </div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New community</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Route buddies &amp; chat</p>
            <span className="mt-3 inline-block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Build a crew →
            </span>
          </div>
        </Card>
      </Link>
    </div>
  );
}

function RiderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const q = query.trim();
    if (q.length < 2) {
      setError("Enter at least 2 characters");
      return;
    }
    router.push(`/app/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="px-4">
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 py-1 shadow-sm shadow-zinc-950/[0.03] transition-shadow focus-within:border-emerald-500 focus-within:shadow-md focus-within:shadow-emerald-500/5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <SearchIcon size={18} className="shrink-0 text-zinc-400" />
        <Input
          className="border-none bg-transparent! px-0! shadow-none focus:ring-0!"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find riders by name…"
          aria-label="Search riders"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      {error && <p className="pt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
  );
}