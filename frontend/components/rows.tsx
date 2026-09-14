"use client";

import Link from "next/link";
import type { Community, Ride, RideParticipant, ConversationListItem, PublicUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Badge } from "./ui";
import { bikeLabel, pluralize, timeAgo } from "@/lib/format";
import { MicIcon } from "./icons";

export function CommunityRow({ community, description }: { community: Community; description?: boolean }) {
  return (
    <Link
      href={`/app/communities/${community.slug}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      <Avatar name={community.name} username={community.slug} image={community.image} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{community.name}</p>
          {community.viewerRole && (
            <Badge tone={community.viewerRole === "owner" ? "green" : "blue"}>{community.viewerRole}</Badge>
          )}
        </div>
        {description ? (
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {pluralize(community.memberCount, "member")} · {pluralize(community.followerCount, "follower")}
          </p>
        ) : (
          community.bio && <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{community.bio}</p>
        )}
      </div>
      <span className={`shrink-0 text-xs font-medium ${community.joinPolicy === "open" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}>
        {community.joinPolicy === "open" ? "Open" : "Request"}
      </span>
    </Link>
  );
}

export function RideRow({ ride }: { ride: Ride }) {
  const roster = ride.participants ?? [];
  return (
    <Link
      href={`/app/rides/${ride.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
        <MicIcon size={20} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{ride.name}</p>
        <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
          {ride.creator?.displayName} · {roster.length}/{ride.maxParticipants} riders{ride.voiceMode === "open" ? " · open mic" : ""}
        </p>
      </div>
      <span className="text-xs text-zinc-400 dark:text-zinc-500">{timeAgo(ride.createdAt)}</span>
    </Link>
  );
}

export function RideParticipantRow({ participant, activeCount }: { participant: RideParticipant; activeCount?: boolean }) {
  const user = participant.user;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Avatar name={user?.displayName ?? "@"} username={user?.username ?? ""} image={user?.profileImage} size={38} />
      <div className="min-w-0 flex-1">
        <Link href={user ? `/app/profile/${user.username}` : "#"} className="block truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100">
          {user?.displayName ?? "Rider"}
        </Link>
        <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
          {user ? bikeLabel(user.bikeInfo) || `@${user.username}` : "—"}
        </p>
      </div>
      {activeCount && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
    </div>
  );
}

export function UserRow({
  user,
  href,
  sub,
  action,
}: {
  user: PublicUser;
  href?: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  const body = (
    <>
      <Avatar name={user.displayName} username={user.username} image={user.profileImage} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{user.displayName}</p>
        <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
          {sub ?? `@${user.username}`}
        </p>
      </div>
      {action}
    </>
  );
  const linkClass = "flex items-center gap-3 px-4 py-3 transition-colors active:bg-zinc-50 dark:active:bg-zinc-900";

  if (href) {
    return (
      <Link href={href} className={linkClass}>
        {body}
      </Link>
    );
  }
  return <div className={linkClass}>{body}</div>;
}

export function ConversationRow({ conversation }: { conversation: ConversationListItem }) {
  const avatarName = conversation.type === "community" ? conversation.title : conversation.participants[0]?.displayName;
  const avatarKey = conversation.type === "community" ? conversation.title : conversation.participants[0]?.username;
  const image = conversation.type === "community" ? conversation.community?.image : conversation.participants[0]?.profileImage;

  return (
    <Link
      href={`/app/messages/${conversation.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      <div className="relative shrink-0">
        <Avatar name={avatarName} username={avatarKey} image={image} size={48} />
        {conversation.unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1 text-[11px] font-bold text-white">
            {conversation.unreadCount}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate ${conversation.unreadCount > 0 ? "font-semibold text-zinc-900 dark:text-zinc-50" : "font-medium text-zinc-700 dark:text-zinc-300"}`}>
            {conversation.title}
          </p>
          {conversation.lastMessageAt && (
            <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{timeAgo(conversation.lastMessageAt)}</span>
          )}
        </div>
        <p className={`truncate text-sm ${conversation.unreadCount > 0 ? "font-medium text-zinc-700 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"}`}>
          {conversation.lastMessage?.content ??
            (conversation.type === "community"
              ? "Community chat"
              : conversation.participants[0]
                ? `Chat with ${conversation.participants[0].displayName}`
                : "New conversation")}
        </p>
      </div>
    </Link>
  );
}