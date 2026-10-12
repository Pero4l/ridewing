import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Divider, Row, T } from "./ui";
import { usePalette } from "@/lib/palette";
import { relativeTime } from "@/lib/format";
import { ApiError, api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Post, PostCommentItem } from "@/lib/types";

export type PostActions = {
  like: (post: Post) => void;
  repost: (post: Post) => void;
  comment: (post: Post) => void;
  share?: (post: Post) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Comment bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function CommentSheet({
  post,
  visible,
  onClose,
}: {
  post: Post;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = usePalette();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [comments, setComments] = useState<PostCommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.get<{ items: PostCommentItem[] }>(
        `/api/posts/${post.id}/comments?limit=50`,
      );
      setComments(page.items);
    } catch {
      // comments fail silently — the post is still readable
    } finally {
      setLoading(false);
    }
  }, [post.id]);

  useEffect(() => {
    if (visible) {
      void load();
    } else {
      setComments([]);
      setDraft("");
    }
  }, [visible, load]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;

    const optimistic: PostCommentItem = {
      id: `pending-${Date.now()}`,
      postId: post.id,
      parentId: null,
      content,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      viewerLiked: false,
      user: user
        ? { id: user.id, username: user.username, displayName: user.displayName, profileImage: user.profileImage ?? null }
        : null,
      pending: true,
    };

    setComments((c) => [...c, optimistic]);
    setDraft("");
    setSending(true);

    try {
      const res = await api.post<{ comment: PostCommentItem }>(
        `/api/posts/${post.id}/comments`,
        { content },
      );
      setComments((c) => c.map((item) => (item.id === optimistic.id ? res.comment : item)));
    } catch {
      setComments((c) => c.filter((item) => item.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dim backdrop */}
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onClose}
        accessibilityLabel="Close comments"
      />

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrapper}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 },
          ]}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <T size={16} weight="700">
              Comments
            </T>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <Divider />

          {/* List */}
          {loading ? (
            <View style={styles.sheetSpinner}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.commentList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <T size={13} tone="muted" style={styles.emptyComments}>
                  No comments yet. Be the first!
                </T>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <Avatar user={item.user} size={32} />
                  <View style={styles.commentBubble}>
                    <View
                      style={[
                        styles.bubbleInner,
                        { backgroundColor: colors.raised, opacity: item.pending ? 0.6 : 1 },
                      ]}
                    >
                      <T size={13} weight="700">
                        {item.user?.displayName ?? "You"}
                      </T>
                      <T size={14} style={{ marginTop: 2 }}>
                        {item.content}
                      </T>
                    </View>
                    <T size={11} tone="muted" style={{ marginTop: 3, marginLeft: 4 }}>
                      {relativeTime(item.createdAt)}
                    </T>
                  </View>
                </View>
              )}
            />
          )}

          <Divider />

          {/* Input row */}
          <View style={styles.inputRow}>
            <Avatar user={user} size={32} />
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={colors.faint}
              multiline
              maxLength={500}
              style={[styles.commentInput, { backgroundColor: colors.raised, color: colors.ink }]}
              returnKeyType="send"
              onSubmitEditing={send}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              style={[
                styles.sendBtn,
                {
                  backgroundColor: draft.trim() && !sending ? colors.accent : colors.raised,
                },
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PostCard — full-bleed, no outer padding
// ─────────────────────────────────────────────────────────────────────────────

export const PostCard = forwardRef<
  { openDetail: () => void },
  { post: Post; onOpenProfile?: (username: string) => void; actions?: PostActions }
>(function PostCard({ post, onOpenProfile, actions }, ref) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = usePalette();

  const [override, setOverride] = useState<{ base: boolean; value: boolean } | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useImperativeHandle(ref, () => ({
    openDetail: () => setCommentOpen(true),
  }));

  const liked =
    override && override.base === post.viewerLiked ? override.value : post.viewerLiked;
  const delta = liked === post.viewerLiked ? 0 : liked ? 1 : -1;
  const likeCount = Math.max(0, post.likeCount + delta);

  function onToggleLike() {
    const next = !liked;
    setOverride({ base: post.viewerLiked, value: next });
    queue.current = queue.current
      .then(() => actions?.like(post))
      .catch(() => setOverride(null));
  }

  function openComments() {
    setCommentOpen(true);
    // Notify the feed so it can refresh the count later
    actions?.comment(post);
  }

  const mediaWidth = width; // full bleed = full screen width

  return (
    <>
      <View style={styles.card}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <Pressable
          onPress={() => {
            if (post.user?.username) {
              if (onOpenProfile) onOpenProfile(post.user.username);
              else router.push(`/profile/${post.user.username}`);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open ${post.user?.displayName ?? "rider"}'s profile`}
        >
          <View style={styles.header}>
            <Avatar user={post.user} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={14} weight="700" numberOfLines={1}>
                {post.user?.displayName ?? "Rider"}
              </T>
              <T size={12} tone="muted">
                @{post.user?.username}
                {post.repostedBy ? " · reposted" : ""}
                {" · "}
                {relativeTime(post.createdAt)}
              </T>
            </View>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </View>
        </Pressable>

        {/* ── Content ────────────────────────────────────────────── */}
        {post.content ? (
          <Pressable
            onPress={openComments}
            accessibilityRole="button"
            accessibilityLabel="View post"
          >
            <T size={15} style={styles.content}>
              {post.content}
            </T>
          </Pressable>
        ) : null}

        {/* ── Media — full bleed, no horizontal padding ──────────── */}
        {post.media.length ? (
          <Pressable
            onPress={openComments}
            accessibilityRole="imagebutton"
            accessibilityLabel="View post"
          >
            <View style={styles.mediaWrap}>
              {post.media.map((item, index) =>
                item.type === "video" ? (
                  <View
                    key={`${item.url}-${index}`}
                    style={[
                      styles.videoPlaceholder,
                      { height: mediaWidth * 0.5625 },
                    ]}
                  >
                    <Ionicons name="play-circle" size={56} color={colors.surface} />
                  </View>
                ) : (
                  <Image
                    key={`${item.url}-${index}`}
                    source={{ uri: item.posterUrl ?? item.url }}
                    style={{
                      width: mediaWidth,
                      aspectRatio:
                        item.width && item.height ? item.width / item.height : 1,
                      maxHeight: 480,
                      backgroundColor: colors.raised,
                    }}
                    contentFit="cover"
                    transition={150}
                  />
                ),
              )}
            </View>
          </Pressable>
        ) : null}

        {/* ── Action bar ─────────────────────────────────────────── */}
        <View style={styles.actions}>
          <ActionBtn
            icon={liked ? "heart" : "heart-outline"}
            label={likeCount > 0 ? fmt(likeCount) : undefined}
            color={liked ? colors.danger : colors.muted}
            accessibilityLabel={liked ? "Unlike" : "Like"}
            onPress={onToggleLike}
          />
          <ActionBtn
            icon="chatbubble-outline"
            label={post.commentCount > 0 ? fmt(post.commentCount) : undefined}
            color={colors.muted}
            accessibilityLabel="Comment"
            onPress={openComments}
          />
          <ActionBtn
            icon="repeat"
            label={post.repostCount > 0 ? fmt(post.repostCount) : undefined}
            color={colors.muted}
            accessibilityLabel="Repost"
            onPress={() => actions?.repost(post)}
          />
          <ActionBtn
            icon="paper-plane-outline"
            label={post.shareCount > 0 ? fmt(post.shareCount) : undefined}
            color={colors.muted}
            accessibilityLabel="Share"
            onPress={() =>
              actions?.share ? actions.share(post) : openComments()
            }
          />
        </View>

        {/* Bottom hairline */}
        <Divider />
      </View>

      <CommentSheet
        post={post}
        visible={commentOpen}
        onClose={() => setCommentOpen(false)}
      />
    </>
  );
});

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function ActionBtn({
  icon,
  label,
  color,
  accessibilityLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={styles.actionBtn}
    >
      <Ionicons name={icon} size={22} color={color} />
      {label ? (
        <T size={13} weight="600" color={color}>
          {label}
        </T>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "transparent",
    // No horizontal padding — media bleeds to screen edges
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    lineHeight: 22,
  },
  mediaWrap: {
    // No padding — images reach both edges
  },
  videoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
  },
  // Comment sheet
  sheetWrapper: {
    // sits at the bottom after the backdrop fills remaining space
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    minHeight: 300,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4D4D8",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetSpinner: {
    paddingVertical: 32,
    alignItems: "center",
  },
  commentList: {
    padding: 16,
    gap: 14,
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  commentBubble: {
    flex: 1,
  },
  bubbleInner: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyComments: {
    textAlign: "center",
    paddingVertical: 24,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  commentInput: {
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
