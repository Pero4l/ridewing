/* eslint-disable react-hooks/set-state-in-effect */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

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
 * below it. Comments support long-press edit/delete for the author.
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

  // Edit mode
  const [editingComment, setEditingComment] = useState<PostCommentItem | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const editInputRef = useRef<TextInput>(null);

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

  // ── Post new comment ──────────────────────────────────────────────────────
  async function comment() {
    const content = draft.trim();
    if (!content || sending) return;

    const optimistic: PostCommentItem = {
      id: `pending-${Date.now()}`,
      postId: String(postId),
      parentId: null,
      content,
      editedAt: null,
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

  // ── Edit ──────────────────────────────────────────────────────────────────
  function startEdit(c: PostCommentItem) {
    setEditingComment(c);
    setEditDraft(c.content);
    setTimeout(() => editInputRef.current?.focus(), 100);
  }

  function cancelEdit() {
    setEditingComment(null);
    setEditDraft("");
  }

  async function saveEdit() {
    if (!editingComment || editSaving) return;
    const content = editDraft.trim();
    if (!content) return;
    if (content === editingComment.content) { cancelEdit(); return; }

    setEditSaving(true);
    const prev = editingComment;
    setComments((c) =>
      c.map((item) =>
        item.id === editingComment.id
          ? { ...item, content, editedAt: new Date().toISOString() }
          : item,
      ),
    );
    setEditingComment(null);
    setEditDraft("");

    try {
      const res = await api.patch<{ comment: PostCommentItem }>(
        `/api/posts/${postId}/comments/${prev.id}`,
        { content },
      );
      setComments((c) => c.map((item) => (item.id === prev.id ? res.comment : item)));
    } catch {
      setComments((c) => c.map((item) => (item.id === prev.id ? prev : item)));
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function confirmDelete(c: PostCommentItem) {
    Alert.alert(
      "Delete comment?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void doDelete(c),
        },
      ],
    );
  }

  async function doDelete(c: PostCommentItem) {
    setComments((prev) => prev.filter((item) => item.id !== c.id));
    try {
      await api.delete(`/api/posts/${postId}/comments/${c.id}`);
      await load(); // refresh comment count
    } catch {
      setComments((prev) => {
        const idx = prev.findIndex((item) => item.createdAt <= c.createdAt);
        const next = [...prev];
        next.splice(idx === -1 ? next.length : idx, 0, c);
        return next;
      });
    }
  }

  // ── Long-press comment menu (owner only) ─────────────────────────────────
  function handleCommentLongPress(c: PostCommentItem) {
    if (c.user?.id !== user?.id || c.pending) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      "Comment",
      undefined,
      [
        { text: "Edit", onPress: () => startEdit(c) },
        { text: "Delete", style: "destructive", onPress: () => confirmDelete(c) },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  }

  // ── Share ────────────────────────────────────────────────────────────────
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

  const isEditing = editingComment !== null;

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

          // ── Comment row ──
          const { item: c } = item;
          const isOwner = !c.pending && c.user?.id === user?.id;
          return (
            <Pressable
              onLongPress={isOwner ? () => handleCommentLongPress(c) : undefined}
              delayLongPress={350}
              style={styles.commentRow}
            >
              <Avatar user={c.user} size={34} />
              <View style={styles.commentBody}>
                <View
                  style={[
                    styles.commentBubble,
                    { backgroundColor: colors.raised, opacity: c.pending ? 0.6 : 1 },
                  ]}
                >
                  {/* Author + content */}
                  <Text
                    style={{ fontSize: 13, lineHeight: 18, color: colors.ink, fontWeight: "400" }}
                  >
                    <Text style={{ fontWeight: "700" }}>
                      {c.user?.displayName ?? "You"}{"  "}
                    </Text>
                    {c.content}
                  </Text>
                </View>

                {/* Meta row */}
                <View style={styles.commentMetaRow}>
                  <T size={11} tone="muted" style={{ marginLeft: 4 }}>
                    {relativeTime(c.createdAt)}
                  </T>
                  {c.editedAt ? (
                    <T size={11} tone="muted" style={{ fontStyle: "italic" }}>
                      · edited
                    </T>
                  ) : null}
                  {isOwner ? (
                    <Pressable
                      onPress={() => handleCommentLongPress(c)}
                      hitSlop={8}
                      accessibilityLabel="Comment options"
                    >
                      <Ionicons name="ellipsis-horizontal" size={14} color={colors.faint} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      {/* Edit mode banner */}
      {isEditing ? (
        <View
          style={[
            styles.editBanner,
            { backgroundColor: colors.accent + "18", borderTopColor: colors.accent + "30" },
          ]}
        >
          <Ionicons name="pencil" size={13} color={colors.accent} />
          <T size={12} color={colors.accent} weight="600" style={{ flex: 1 }}>
            Editing comment
          </T>
          <Pressable onPress={cancelEdit} hitSlop={8}>
            <T size={12} tone="muted">
              Cancel
            </T>
          </Pressable>
        </View>
      ) : null}

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
        {isEditing ? (
          <>
            <TextInput
              ref={editInputRef}
              value={editDraft}
              onChangeText={setEditDraft}
              placeholder="Edit your comment…"
              placeholderTextColor={colors.faint}
              keyboardAppearance={dark ? "dark" : "light"}
              multiline
              maxLength={500}
              style={[
                styles.input,
                {
                  backgroundColor: colors.raised,
                  color: colors.ink,
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                },
              ]}
            />
            <Pressable
              onPress={() => void saveEdit()}
              disabled={!editDraft.trim() || editSaving}
              accessibilityRole="button"
              accessibilityLabel="Save edit"
              style={[
                styles.sendBtn,
                { backgroundColor: editDraft.trim() && !editSaving ? colors.accent : colors.raised },
              ]}
            >
              {editSaving ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={editDraft.trim() ? colors.onAccent : colors.faint}
                />
              )}
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              ref={inputRef}
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
          </>
        )}
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
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginLeft: 4,
  },
  editBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
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
