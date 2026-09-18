"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { FollowButton } from "@/components/follow-button";
import { Avatar } from "@/components/avatar";
import { Badge, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { BackIcon, MessagesIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/verified-badge";
import { MediaGrid } from "@/components/media-grid";
import { bikeLabel, fullDateOnly } from "@/lib/format";
import type { Page, Post, Profile, PublicUser } from "@/lib/types";

type CountTab = "followers" | "following" | null;
type GalleryTab = "posts" | "tagged" | "shared";

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { user: viewer } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countTab, setCountTab] = useState<CountTab>(null);
  const [galleryTab, setGalleryTab] = useState<GalleryTab>("posts");
  const [roster, setRoster] = useState<PublicUser[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tabError, setTabError] = useState<string | null>(null);
  const [postsLoading, setPostsLoading] = useState(true);
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

  const loadPosts = useCallback(
    async (tab: GalleryTab) => {
      setPostsLoading(true);
      setTabError(null);
      try {
        const page = await api.get<Page<Post>>(`/api/users/${username}/posts?tab=${tab}`);
        setPosts(page.items);
      } catch (error) {
        setTabError(error instanceof ApiError ? error.message : "Could not load posts");
      } finally {
        setPostsLoading(false);
      }
    },
    [username],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCountTab(null);
      setGalleryTab("posts");
      try {
        const res = await api.get<{ user: Profile }>(`/api/users/${username}`);
        if (cancelled) return;
        setProfile(res.user);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof ApiError ? error.message : "Could not load profile");
      }
      if (!cancelled) void loadPosts("posts");
    })();

    return () => {
      cancelled = true;
    };
  }, [username, loadPosts]);

  const openCountTab = useCallback(
    async (next: Exclude<CountTab, null>) => {
      if (!profile) return;
      setCountTab(next);
      setPosts([]);
      setTabError(null);
      try {
        const page = await api.get<Page<PublicUser>>(`/api/users/${username}/${next}`);
        setRoster(page.items);
      } catch (error) {
        setTabError(error instanceof ApiError ? error.message : "Could not load list");
      }
    },
    [profile, username],
  );

  const switchGalleryTab = useCallback(
    (tab: GalleryTab) => {
      setCountTab(null);
      setGalleryTab(tab);
      void loadPosts(tab);
    },
    [loadPosts],
  );

  const visibleMedia = useMemo(
    () => posts.flatMap((post) => post.media.filter((item) => item.url)),
    [posts],
  );

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
      </PageHeader>

      <div className="px-4">
        <div className="flex items-center gap-4">
          <Avatar name={profile.displayName} username={profile.username} image={profile.profileImage} size={84} />
          <div className="min-w-0 flex-1">
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

        {/* Counts sit above the bio, Instagram-style. */}
        <div className="mt-4 flex items-center gap-5 text-sm">
          <span className="text-zinc-900 dark:text-zinc-100">
            <span className="font-bold">{profile.postCount}</span> <span className="text-zinc-500">posts</span>
          </span>
          <button type="button" onClick={() => void openCountTab("followers")} className="text-zinc-900 dark:text-zinc-100">
            <span className="font-bold">{profile.followerCount}</span> <span className="text-zinc-500">followers</span>
          </button>
          <button type="button" onClick={() => void openCountTab("following")} className="text-zinc-900 dark:text-zinc-100">
            <span className="font-bold">{profile.followingCount}</span> <span className="text-zinc-500">following</span>
          </button>
        </div>

        {profile.bio && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{profile.bio}</p>}

        <div className="mt-4 flex items-center gap-2">
          {!isSelf ? (
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
          ) : (
            <Link
              href="/app/settings"
              className="grid h-9 flex-1 place-items-center rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Edit profile
            </Link>
          )}
        </div>

        {!isSelf && <p className="mt-3 text-xs text-zinc-400">Joined {fullDateOnly(profile.createdAt)}</p>}
      </div>

      {countTab && (
        <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 px-4 pt-2">
            <button type="button" onClick={() => setCountTab(null)} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              ← Back
            </button>
            <span className="py-1 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400">{countTab}</span>
          </div>
          {tabError ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{tabError}</p>
          ) : roster == null ? (
            <div className="grid place-items-center py-10">
              <InlineSpinner />
            </div>
          ) : roster.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">No one here yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {roster.map((person) => (
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

      {!countTab && (
        <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-around border-b border-zinc-100 dark:border-zinc-800">
            {(["posts", "tagged", "shared"] as GalleryTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchGalleryTab(tab)}
                className={`flex-1 border-b-2 py-2.5 text-xs font-semibold capitalize transition-colors ${
                  galleryTab === tab
                    ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {postsLoading ? (
            <div className="grid place-items-center py-12">
              <InlineSpinner />
            </div>
          ) : tabError ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{tabError}</p>
          ) : visibleMedia.length === 0 ? (
            <EmptyState
              icon={<span className="text-lg font-bold">📷</span>}
              title={
                galleryTab === "posts"
                  ? "No posts yet"
                  : galleryTab === "shared"
                    ? "Nothing shared yet"
                    : "No tagged posts yet"
              }
              description={
                galleryTab === "posts"
                  ? isSelf
                    ? "Share a photo or note from the feed."
                    : "Riders share their rides as they go."
                  : galleryTab === "shared"
                    ? "Posts this rider has passed on will appear here."
                    : "Posts mentioning @this rider will appear here."
              }
            />
          ) : (
            <div className="p-2">
              <MediaGrid media={visibleMedia} preview={false} />
            </div>
          )}
          {!postsLoading && (galleryTab === "posts" || galleryTab === "shared" || galleryTab === "tagged") && (
            <div className="px-4 pb-6 pt-1 text-center text-xs text-zinc-400">
              <SectionTitle>{galleryTab === "posts" ? "Posts" : galleryTab === "shared" ? "Shared" : "Tagged"} by {profile.displayName}</SectionTitle>
            </div>
          )}
        </div>
      )}
    </div>
  );
}