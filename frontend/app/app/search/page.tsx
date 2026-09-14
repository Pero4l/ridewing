"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-fetch";
import type { PublicUser } from "@/lib/types";

type SearchUser = PublicUser & { viewerIsFollowing: boolean };
import { UserRow } from "@/components/rows";
import { FollowButton } from "@/components/follow-button";
import { EmptyState, SectionTitle } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { SearchIcon } from "@/components/icons";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-16"><InlineSpinner /></div>}>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";

  const users = useApi<{ users: SearchUser[] }>(
    () => api.get(`/api/users/search?q=${encodeURIComponent(q)}`),
    [q],
  );

  return (
    <div>
      <SectionTitle>Search results for “{q}”</SectionTitle>
      {users.loading ? (
        <div className="grid place-items-center py-12">
          <InlineSpinner />
        </div>
      ) : users.error ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{users.error}</p>
      ) : users.data && users.data.users.length ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {users.data.users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              href={`/app/profile/${user.username}`}
              action={<FollowButton user={user} />}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<SearchIcon size={32} />}
          title="No riders found"
          description="Try a different search"
          action={
            <Link href="/app" className="text-sm font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200">
              Back home
            </Link>
          }
        />
      )}
    </div>
  );
}