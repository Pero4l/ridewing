/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";

import { PostCard, type PostActions } from "@/components/post-card";
import { Avatar, Button, Card, Divider, EmptyState, ErrorState, Row, Screen, Spinner, T } from "@/components/ui";
import { RiderPicker } from "@/components/rider-picker";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { relativeTime } from "@/lib/format";
import type { Page, Post, PostCommentItem } from "@/lib/types";

export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostCommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [shareTo, setShareTo] = useState<string | null>(null);
  const [, setSharing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ post: Post }>(`/api/posts/${postId}`);
      setPost(res.post);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this post.");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // Comments are paginated with an opaque cursor, so this is always the first page.
  const loadComments = useCallback(async () => {
    try {
      const page = await api.get<Page<PostCommentItem>>(`/api/posts/${postId}/comments?limit=50`);
      setComments(page.items);
    } catch {
      // The post still renders without its comments.
    }
  }, [postId]);

  useEffect(() => {
    void load();
    void loadComments();
  }, [load, loadComments]);

  async function comment() {
    const content = draft.trim();
    if (!content || sending) return;

    const optimistic: PostCommentItem = {
      id: `pending-${Date.now()}`,
      postId: String(postId),
      parentId: null,
      content,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      viewerLiked: false,
      user: null,
      pending: true,
    };
    setComments((c) => [...c, optimistic]);
    setDraft("");
    setSending(true);

    try {
      const res = await api.post<{ comment: PostCommentItem }>(`/api/posts/${postId}/comments`, {
        content,
      });
      setComments((c) =>
        c.map((item) => (item.id === optimistic.id ? res.comment : item)),
      );
      await load();
    } catch (err) {
      setComments((c) => c.filter((item) => item.id !== optimistic.id));
      setError(err instanceof ApiError ? err.message : "Comment not sent.");
    } finally {
      setSending(false);
    }
  }

  async function shareToRider(username: string) {
    setShareTo(null);
    if (username === "__all__") {
      // The picker offered "search all riders"; reopen in directory mode.
      setTimeout(() => setShareTo("__all__"), 0);
      return;
    }
    setSharing(true);
    try {
      await api.post(`/api/posts/${postId}/share-to`, { username });
      setError(null);
      setPost((p) => (p ? { ...p, shareCount: p.shareCount + 1 } : p));
      router.push("/(tabs)/messages");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that post.");
    } finally {
      setSharing(false);
    }
  }

  const actions: PostActions = {
    like: async (target) => {
      try {
        const res = await api.post<{ liked: boolean }>(`/api/posts/${target.id}/like`);
        setPost((p) =>
          p && p.id === target.id
            ? {
                ...p,
                viewerLiked: res.liked,
                likeCount: Math.max(0, p.likeCount + (res.liked ? 1 : -1)),
              }
            : p,
        );
      } catch {
        // Falls back to the server value on refresh.
      }
    },
    repost: async (target) => {
      try {
        await api.post(`/api/posts/${target.id}/repost`);
        setPost((p) => (p ? { ...p, repostCount: p.repostCount + 1 } : p));
      } catch {
        // Already reposted — the server treats it as a no-op.
      }
    },
    comment: () => {},
    share: (target) => {
      // The card's Share row opened the post itself; make it open the picker.
      void target;
      setShareTo("");
    },
  };

  if (loading) {
    return (
      <Screen>
        <Spinner label="Loading post" />
      </Screen>
    );
  }

  if (error && !post) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!post) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Post not found" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <PostCard post={post} actions={actions} onOpenProfile={(u) => router.push(`/profile/${u}`)} />

        <Card className="gap-3">
          <T size={15} weight="700">
            Comments ({post.commentCount})
          </T>
          <Divider />
          {comments.length ? (
            comments.map((item) => (
              <Row key={item.id} gap={10} className="items-start">
                <Avatar user={item.user} size={30} />
                <View className="flex-1 gap-0.5">
                  <Row gap={6}>
                    <T size={13} weight="700">
                      {item.user?.displayName ?? "You"}
                    </T>
                    <T size={11} muted>
                      {relativeTime(item.createdAt)}
                    </T>
                  </Row>
                  <T size={14} className={item.pending ? "opacity-60" : undefined}>
                    {item.content}
                  </T>
                </View>
              </Row>
            ))
          ) : (
            <T size={13} muted>
              No comments yet.
            </T>
          )}

          <Divider />

          <Row gap={10} className="items-end">
            <View className="flex-1">
              <CommentInput value={draft} onChangeText={setDraft} placeholder="Add a comment" />
            </View>
            <Button
              label="Send"
              onPress={comment}
              loading={sending}
              disabled={!draft.trim()}
            />
          </Row>
        </Card>
      </ScrollView>

      <RiderPicker
        visible={shareTo !== null}
        title="Send this post to a rider"
        subtitle="It arrives in your conversation with them."
        friendsOnly={shareTo !== "__all__"}
        onClose={() => setShareTo(null)}
        onPick={(username) => void shareToRider(username)}
      />
    </Screen>
  );
}

function CommentInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
}) {
  const { colors } = usePalette();

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      className="rounded-md bg-raised px-3 py-2.5 text-[14px] text-ink"
    />
  );
}