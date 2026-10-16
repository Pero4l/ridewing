/* eslint-disable react-hooks/set-state-in-effect */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { PostCard, type PostActions } from "@/components/post-card";
import {
  Avatar,
  Divider,
  EmptyState,
  ErrorState,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { RiderPicker } from "@/components/rider-picker";
import { ApiError, api } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { relativeTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Page, Post, PostCommentItem } from "@/lib/types";

/**
 * Full post detail — the same full-bleed PostCard with all comments listed
 * below it. This is what you land on from a deep-link or from a notification.
 *
 * On the feed the comment sheet opens as a bottom sheet; here the comments
 * are part of the page scroll so the experience feels intentional rather than
 * accidental.
 */
export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { colors, dark } = usePalette();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostCommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [shareTo, setShareTo] = useState<string | null>(null);

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

  const loadComments = useCallback(async () => {
    try {
      const page = await api.get<Page<PostCommentItem>>(
        `/api/posts/${postId}/comments?limit=50`,
      );
      setComments(page.items);
    } catch {
      // Comments fail silently — the post is still readable.
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
      user: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            profileImage: user.profileImage ?? null,
            bio: null,
            bikeInfo: {},
            emailVerifiedAt: null,
            createdAt: new Date().toISOString(),
          }
        : null,
      pending: true,
    };
    setComments((c) => [...c, optimistic]);
    setDraft("");
    setSending(true);

    try {
      const res = await api.post<{ comment: PostCommentItem }>(
        `/api/posts/${postId}/comments`,
        { content },
      );
      setComments((c) => c.map((item) => (item.id === optimistic.id ? res.comment : item)));
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
      setTimeout(() => setShareTo("__all__"), 0);
      return;
    }
    try {
      await api.post(`/api/posts/${postId}/share-to`, { username });
      setPost((p) => (p ? { ...p, shareCount: p.shareCount + 1 } : p));
      router.push("/(tabs)/messages");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that post.");
    }
  }

  const actions: PostActions = {
    like: async (target) => {
      try {
        const res = await api.post<{ liked: boolean }>(`/api/posts/${target.id}/like`);
        setPost((p) =>
          p && p.id === target.id
            ? { ...p, viewerLiked: res.liked, likeCount: Math.max(0, p.likeCount + (res.liked ? 1 : -1)) }
            : p,
        );
      } catch { /* server truth restores on refresh */ }
    },
    repost: async (target) => {
      try {
        await api.post(`/api/posts/${target.id}/repost`);
        setPost((p) => (p ? { ...p, repostCount: p.repostCount + 1 } : p));
      } catch { /* already reposted */ }
    },
    comment: () => { /* on this page, tapping comment = scroll down */ },
    share: () => setShareTo(""),
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

  type ListItem =
    | { kind: "post" }
    | { kind: "divider" }
    | { kind: "comment"; item: PostCommentItem }
    | { kind: "empty" };

  const data: ListItem[] = [
    { kind: "post" },
    { kind: "divider" },
    ...comments.map((c) => ({ kind: "comment" as const, item: c })),
    ...(comments.length === 0 ? [{ kind: "empty" as const }] : []),
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.canvas }}
    >
      <FlatList
        data={data}
        keyExtractor={(item, index) =>
          item.kind === "comment" ? item.item.id : `${item.kind}-${index}`
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.kind === "post") {
            return (
              <PostCard
                post={post}
                actions={actions}
                onOpenProfile={(u) => router.push(`/profile/${u}`)}
              />
            );
          }
          if (item.kind === "divider") {
            return (
              <View style={styles.commentSection}>
                <T size={13} weight="700" style={{ color: colors.muted, letterSpacing: 0.5 }}>
                  COMMENTS {post.commentCount > 0 ? `· ${post.commentCount}` : ""}
                </T>
              </View>
            );
          }
          if (item.kind === "empty") {
            return (
              <T size={13} tone="muted" style={styles.noComments}>
                No comments yet. Be the first!
              </T>
            );
          }
          // comment
          const { item: c } = item;
          return (
            <View style={styles.commentRow}>
              <Avatar user={c.user} size={34} />
              <View style={styles.commentBody}>
                <View
                  style={[
                    styles.commentBubble,
                    { backgroundColor: colors.raised, opacity: c.pending ? 0.6 : 1 },
                  ]}
                >
                  <T size={13} weight="700">
                    {c.user?.displayName ?? "You"}
                  </T>
                  <T size={14} style={{ marginTop: 2, lineHeight: 20 }}>
                    {c.content}
                  </T>
                </View>
                <T size={11} tone="muted" style={{ marginTop: 3, marginLeft: 4 }}>
                  {relativeTime(c.createdAt)}
                </T>
              </View>
            </View>
          );
        }}
      />

      {/* Comment input fixed at the bottom */}
      <Divider />
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + 10,
          },
        ]}
      >
        <Avatar user={user} size={32} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment…"
          placeholderTextColor={colors.faint}
          keyboardAppearance={dark ? "dark" : "light"}
          multiline
          maxLength={500}
          style={[styles.input, { backgroundColor: colors.raised, color: colors.ink }]}
        />
        <Pressable
          onPress={comment}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          style={[
            styles.sendBtn,
            { backgroundColor: draft.trim() && !sending ? colors.accent : colors.raised },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={18}
              color={draft.trim() ? colors.onAccent : colors.faint}
            />
          )}
        </Pressable>
      </View>

      <RiderPicker
        visible={shareTo !== null}
        title="Send this post to a rider"
        subtitle="It arrives in your conversation with them."
        friendsOnly={shareTo !== "__all__"}
        onClose={() => setShareTo(null)}
        onPick={(username) => void shareToRider(username)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  commentSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  noComments: {
    textAlign: "center",
    paddingVertical: 28,
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  commentBody: {
    flex: 1,
  },
  commentBubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
