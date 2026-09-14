"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-fetch";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { Badge, Button, EmptyState, SectionTitle, Textarea } from "@/components/ui";
import { InlineSpinner } from "@/components/spinner";
import { BackIcon, MessagesIcon } from "@/components/icons";
import { VerifiedBadge } from "@/components/verified-badge";
import type { Community, CommunityMemberItem, JoinRequest } from "@/lib/types";
import { pluralize } from "@/lib/format";

const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };

export default function CommunityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  return (
    <div>
      <Header slug={slug} />
    </div>
  );
}

function Header({ slug }: { slug: string }) {
  const router = useRouter();
  const toast = useToast();

  const detail = useApi<{ community: Community }>(() => api.get(`/api/communities/${slug}`), [slug]);
  const members = useApi<{ items: CommunityMemberItem[] }>(
    () => api.get(`/api/communities/${slug}/members`),
    [slug],
  );

  const [busy, setBusy] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const reloadAll = useCallback(() => {
    detail.reload();
    members.reload();
  }, [detail, members]);

  const run = useCallback(
    async (operation: () => Promise<unknown>, successMessage?: string) => {
      setBusy(true);
      try {
        await operation();
        if (successMessage) toast.success(successMessage);
        reloadAll();
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [reloadAll, toast],
  );

  if (detail.loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <InlineSpinner />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <EmptyState
        title="Community not found"
        description={detail.error ?? undefined}
        action={
          <Button size="sm" variant="secondary" onClick={() => router.push("/app/communities")}>
            Back to communities
          </Button>
        }
      />
    );
  }

  const community = detail.data.community;
  const canModerate = community.viewerRole === "owner" || community.viewerRole === "admin" || community.viewerRole === "moderator";
  const isMember = Boolean(community.viewerRole);

  function join() {
    run(async () => {
      await api.post(`/api/communities/${slug}/join`, { message: joinMessage.trim() || undefined });
      toast.success(community.joinPolicy === "open" ? "Joined!" : "Request sent — a moderator will review it.");
      setShowJoinForm(false);
    });
  }

  async function openChat() {
    setChatBusy(true);
    try {
      const res = await api.get<{ conversationId: string }>(`/api/communities/${slug}/conversation`);
      router.push(`/app/messages/${res.conversationId}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not open chat");
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Back"
        >
          <BackIcon size={18} />
        </button>
        <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">Community</span>
      </div>

      <div className="px-4">
        {community.image ? (
          <img src={community.image} alt="" className="h-36 w-full rounded-xl object-cover" />
        ) : (
          <div className="grid h-24 w-full place-items-center rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 text-4xl font-bold text-zinc-400 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-600">
            {community.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {community.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {pluralize(community.memberCount, "member")} ·{" "}
              {pluralize(community.followerCount, "follower")}
              {community.joinPolicy === "open" ? " · open" : " · by request"}
            </p>
          </div>
          {community.owner && (
            <Link href={`/app/profile/${community.owner.username}`}>
              <Avatar name={community.owner.displayName} username={community.owner.username} size={40} />
            </Link>
          )}
        </div>

        {community.bio && <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{community.bio}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isMember ? (
            <>
              <Button size="sm" onClick={openChat} loading={chatBusy}>
                <MessagesIcon size={16} />
                Open chat
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => api.post(`/api/communities/${slug}/leave`), "You left the community")}>
                Leave
              </Button>
            </>
          ) : community.viewerJoinRequestStatus === "pending" ? (
            <>
              <Badge tone="amber">Request pending</Badge>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => api.delete(`/api/communities/${slug}/requests/mine`), "Request cancelled")}>
                Cancel request
              </Button>
            </>
          ) : community.joinPolicy === "open" ? (
            <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/api/communities/${slug}/join`), "Joined!")}>
              Join community
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => setShowJoinForm((v) => !v)}>
              Request to join
            </Button>
          )}

          <CommunityFollowButton community={community} onChanged={() => detail.reload()} />

          {!isMember && community.viewerJoinRequestStatus !== "pending" && community.joinPolicy === "request" && showJoinForm && (
            <div className="mt-2 w-full space-y-2">
              <Textarea
                value={joinMessage}
                onChange={(event) => setJoinMessage(event.target.value)}
                placeholder="Tell the crew who you are (optional)"
                maxLength={300}
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={join}>
                  Send request
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowJoinForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {canModerate && (
        <ModArea slug={slug} onChanged={reloadAll} />
      )}

      <SectionTitle>Members</SectionTitle>
      {members.loading ? (
        <div className="grid place-items-center py-8">
          <InlineSpinner />
        </div>
      ) : members.data && members.data.items.length ? (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.data.items.map((member) => (
            <MemberRow key={member.id} member={member} community={community} onChanged={reloadAll} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-zinc-400">No members yet.</p>
      )}
    </div>
  );
}

function CommunityFollowButton({ community, onChanged }: { community: Community; onChanged: () => void }) {
  const [following, setFollowing] = useState(community.viewerIsFollowing);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  return (
    <Button
      size="sm"
      variant={following ? "secondary" : "ghost"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (following) {
            await api.delete(`/api/communities/${community.slug}/follow`);
          } else {
            await api.post(`/api/communities/${community.slug}/follow`);
          }
          setFollowing(!following);
          onChanged();
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : "Could not update follow");
        } finally {
          setBusy(false);
        }
      }}
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}

function MemberRow({
  member,
  community,
  onChanged,
}: {
  member: CommunityMemberItem;
  community: Community;
  onChanged: () => void;
}) {
  const [role, setRole] = useState(member.role);
  const toast = useToast();
  const canManage =
    (community.viewerRole === "owner" || community.viewerRole === "admin" || community.viewerRole === "moderator") &&
    member.id !== community.ownerId &&
    BOOTSTRAP_ROLE_GUARD(community.viewerRole, member.role);
  const canTransfer = community.viewerRole === "owner" && member.id !== community.ownerId;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Link href={`/app/profile/${member.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.displayName} username={member.username} image={member.profileImage} size={40} />
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
            <span className="truncate">{member.displayName}</span>
            <VerifiedBadge user={member} size={13} />
          </p>
          <p className="text-xs text-zinc-400">@{member.username}</p>
        </div>
      </Link>
      <RoleBadge role={role} />
      {canTransfer && (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await api.post(`/api/communities/${community.slug}/transfer-ownership/${member.username}`);
              toast.success("Ownership transferred");
              onChanged();
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : "Transfer failed");
            }
          }}
        >
          Make owner
        </Button>
      )}
      {canManage && (
        <select
          aria-label={`Change ${member.username}'s role`}
          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          value={role}
          onChange={async (event) => {
            const next = event.target.value as typeof role;
            setRole(next);
            try {
              await api.put(`/api/communities/${community.slug}/members/${member.username}/role`, { role: next });
              toast.success(`Role set to ${next}`);
              onChanged();
            } catch (error) {
              setRole(member.role);
              toast.error(error instanceof ApiError ? error.message : "Role change failed");
            }
          }}
        >
          <option value="admin">admin</option>
          <option value="moderator">moderator</option>
          <option value="member">member</option>
        </select>
      )}
      {canManage && (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-500!"
          onClick={async () => {
            if (!confirm(`Remove ${member.displayName} from ${community.name}?`)) return;
            try {
              await api.delete(`/api/communities/${community.slug}/members/${member.username}`);
              toast.success("Member removed");
              onChanged();
            } catch (error) {
              toast.error(error instanceof ApiError ? error.message : "Could not remove member");
            }
          }}
        >
          Remove
        </Button>
      )}
    </div>
  );
}

function BOOTSTRAP_ROLE_GUARD(actor: Community["viewerRole"], target: CommunityMemberItem["role"]) {
  if (!actor) return false;
  if (target === "owner") return false;
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

function RoleBadge({ role }: { role: CommunityMemberItem["role"] }) {
  const tone = role === "owner" ? "green" : role === "admin" ? "blue" : role === "moderator" ? "amber" : "zinc";
  return <Badge tone={tone}>{role}</Badge>;
}

function ModArea({
  slug,
  onChanged,
}: {
  slug: string;
  onChanged: () => void;
}) {
  const requests = useApi<{ requests: JoinRequest[] }>(
    () => api.get(`/api/communities/${slug}/requests?status=pending`),
    [slug],
  );
  const toast = useToast();

  return (
    <>
      <SectionTitle>Join requests</SectionTitle>
      {requests.loading ? (
        <div className="grid place-items-center py-6">
          <InlineSpinner />
        </div>
      ) : requests.data && requests.data.requests.length ? (
        <div className="divide-y divide-zinc-100 px-4 dark:divide-zinc-800">
          {requests.data.requests.map((request) => (
            <div key={request.id} className="flex items-center gap-3 py-3">
              {request.user && (
                <Avatar name={request.user.displayName} username={request.user.username} image={request.user.profileImage} size={40} />
              )}
              <div className="min-w-0 flex-1">
                <Link href={request.user ? `/app/profile/${request.user.username}` : "#"} className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {request.user?.displayName ?? "Unknown rider"}
                </Link>
                {request.message && <p className="truncate text-xs text-zinc-400">{request.message}</p>}
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await api.post(`/api/communities/${slug}/requests/${request.id}/review`, { decision: "approved" });
                    toast.success(`${request.user?.displayName} joined`);
                    requests.reload();
                    onChanged();
                  } catch (error) {
                    toast.error(error instanceof ApiError ? error.message : "Could not approve");
                  }
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500!"
                onClick={async () => {
                  try {
                    await api.post(`/api/communities/${slug}/requests/${request.id}/review`, { decision: "rejected" });
                    requests.reload();
                  } catch (error) {
                    toast.error(error instanceof ApiError ? error.message : "Could not reject");
                  }
                }}
              >
                Decline
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 text-sm text-zinc-400">No pending requests.</p>
      )}
    </>
  );
}