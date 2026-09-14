"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { FollowButton } from "@/components/follow-button";
import { Avatar } from "@/components/avatar";
import { Badge, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { BackIcon, CogIcon, MessagesIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/verified-badge";
import { bikeLabel, fullDate, pluralize } from "@/lib/format";
import type { Page, Profile, PublicUser } from "@/lib/types";

type Tab = "followers" | "following";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { user: viewer } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [followers, setFollowers] = useState<PublicUser[] | null>(null);
  const [following, setFollowing] = useState<PublicUser[] | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get<{ user: Profile }>(`/api/users/${username}`);
      setProfile(res.user);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Could not load profile");
    }
  }, [username]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTab(null);
      try {
        const res = await api.get<{ user: Profile }>(`/api/users/${username}`);
        if (cancelled) return;
        setProfile(res.user);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof ApiError ? error.message : "Could not load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const openTab = useCallback(async (next: Tab) => {
    if (!profile) return;
    setTab(next);
    setTabError(null);
    try {
      const page = await api.get<Page<PublicUser>>(`/api/users/${username}/${next}`);
      if (next === "followers") setFollowers(page.items);
      else setFollowing(page.items);
    } catch (error) {
      setTabError(error instanceof ApiError ? error.message : "Could not load list");
    }
  }, [profile, username]);

  async function message() {
    if (!profile || messaging) return;
    setMessaging(true);
    try {
      const res = await api.post<{ conversation: { id: string } }>("/api/conversations/direct", {
        username: profile.username,
      });
      router.push(`/app/messages/${res.conversation.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not open a conversation");
    } finally {
      setMessaging(false);
    }
  }

  if (loadError) {
    return (
      <>
        <PageHeader>
          <button type="button" onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">
            <BackIcon size={18} />
          </button>
        </PageHeader>
        <EmptyState title="Rider not found" description={loadError} />
      </>
    );
  }

  if (!profile) {
    return (
      <div className="grid h-dvh place-items-center">
        <InlineSpinner />
      </div>
    );
  }

  const isSelf = profile.isSelf;
  const bike = bikeLabel(profile.bikeInfo);

  return (
    <div>
      <PageHeader>
        <button type="button" onClick={() => router.back()} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">
          <BackIcon size={18} />
        </button>
        {isSelf && (
          <Link
            href="/app/settings"
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Settings"
          >
            <CogIcon size={18} />
          </Link>
        )}
      </PageHeader>

      <div className="px-4">
        <div className="flex items-center gap-4">
          <Avatar name={profile.displayName} username={profile.username} image={profile.profileImage} size={80} />
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 truncate text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              <span className="truncate">{profile.displayName}</span>
              <VerifiedBadge user={profile} size={18} />
            </h1>
            <p className="truncate text-sm text-zinc-400">
              @{profile.username}
              {bike && <span className="ml-1.5">· {bike}</span>}
            </p>
            {profile.followsViewer && !isSelf && (
              <span className="mt-1 inline-block">
                <Badge tone="zinc">Follows you</Badge>
              </span>
            )}
          </div>
        </div>

        {profile.bio && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{profile.bio}</p>}

        <div className="mt-3 flex gap-2">
          {!isSelf && (
            <>
              <FollowButton user={profile} onChanged={() => void loadProfile()} />
              <button
                type="button"
                onClick={message}
                disabled={messaging}
                className="grid h-9 min-w-9 place-items-center rounded-full border border-zinc-300 px-3 text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label="Send a message"
              >
                <MessagesIcon size={18} />
              </button>
            </>
          )}
        </div>

        <div className="mt-5 flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => openTab("followers")}
            className={`rounded-lg px-2.5 py-1.5 font-medium ${tab === "followers" ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
          >
            {pluralize(profile.followerCount, "follower")}
          </button>
          <button
            type="button"
            onClick={() => openTab("following")}
            className={`rounded-lg px-2.5 py-1.5 font-medium ${tab === "following" ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
          >
            {pluralize(profile.followingCount, "following")}
          </button>
          <span className="ml-auto text-xs text-zinc-400">Joined {fullDate(profile.createdAt)}</span>
        </div>
      </div>

      {tab && (
        <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800">
          <SectionTitle>{tab === "followers" ? "Followers" : "Following"}</SectionTitle>
          {tabError ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{tabError}</p>
          ) : (tab === "followers" ? followers : following) == null ? (
            <div className="grid place-items-center py-10">
              <InlineSpinner />
            </div>
          ) : (tab === "followers" ? followers : following)?.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">No one here yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(tab === "followers" ? followers : following)?.map((person) => (
                <Link key={person.id} href={`/app/profile/${person.username}`} className="flex items-center gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-900">
                  <Avatar name={person.displayName} username={person.username} image={person.profileImage} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{person.displayName}</p>
                    <p className="truncate text-xs text-zinc-400">
                      @{person.username}
                      {person.bikeInfo && bikeLabel(person.bikeInfo) && <span className="ml-1.5">· {bikeLabel(person.bikeInfo)}</span>}
                    </p>
                  </div>
                  {person.id === viewer?.id && <Badge tone="zinc">You</Badge>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}