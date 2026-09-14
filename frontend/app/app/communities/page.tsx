"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-fetch";
import type { Community, Page } from "@/lib/types";
import { CommunityRow } from "@/components/rows";
import { Button, EmptyState, Input, PageHeader, SectionTitle } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { CommunitiesIcon, PlusIcon, SearchIcon } from "@/components/icons";

export default function CommunitiesPage() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const list = useApi<Page<Community>>(
    () => api.get(`/api/communities${applied ? `?search=${encodeURIComponent(applied)}` : ""}`),
    [applied],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setApplied(search.trim());
  }

  return (
    <div>
      <PageHeader>
        <h1 className="flex-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Communities
        </h1>
        <Link href="/app/communities/new">
          <Button size="sm">
            <PlusIcon size={16} />
            New
          </Button>
        </Link>
      </PageHeader>

      <form onSubmit={onSubmit} className="flex items-center gap-2 px-4 pb-1">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900">
          <SearchIcon size={16} className="text-zinc-400" />
          <Input
            className="h-10! border-none bg-transparent! px-0! focus:outline-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search communities"
            aria-label="Search communities"
          />
        </div>
        <Button type="submit" size="sm">
          Go
        </Button>
      </form>

      <SectionTitle>{applied ? "Matches" : "All communities"}</SectionTitle>
      {list.loading ? (
        <div className="grid place-items-center py-14">
          <InlineSpinner />
        </div>
      ) : list.error ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{list.error}</p>
      ) : list.data && list.data.items.length ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {list.data.items.map((community) => (
            <CommunityRow key={community.slug} community={community} description />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CommunitiesIcon size={32} />}
          title={applied ? "No communities match" : "No communities yet"}
          description={
            applied
              ? undefined
              : "Start one for your route, your track days, or your weekend crew."
          }
          action={
            !applied ? (
              <Link href="/app/communities/new">
                <Button size="sm">Create a community</Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}