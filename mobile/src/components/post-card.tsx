/* eslint-disable react-hooks/set-state-in-effect --
 * CommentSheet loads on open. The effect only *starts* the async fetch;
 * setState lands after an `await`.
 */
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
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
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Divider, T, VerifiedTick } from "./ui";
import { FeedVideo } from "./feed-video";
import { usePalette } from "@/lib/palette";
import { relativeTime } from "@/lib/format";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Post, PostCommentItem, PostMedia } from "@/lib/types";

export type PostActions = {
  like: (post: Post) => void;
  repost: (post: Post) => void;
  comment: (post: Post) => void;
  share?: (post: Post) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Comment bottom sheet — Instagram style
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
  const { colors, dark } = usePalette();
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
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
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
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onClose}
        accessibilityLabel="Close comments"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrapper}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 10 },
          ]}
        >
          {/* Handle — hairline so it reads on light and dark sheets */}
          <View style={[styles.handle, { backgroundColor: colors.hairline }]} />
          <View style={styles.sheetHeader}>
            <View style={{ width: 32 }} />
            <T size={15} weight="700">
              Comments
            </T>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <Divider />
          {loading ? (
            <View style={styles.sheetSpinner}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.commentList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="items-center gap-1 py-10">
                  <T size={15} weight="700">
                    No comments yet
                  </T>
                  <T size={13} tone="muted">
                    Start the conversation.
                  </T>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <Avatar user={item.user} size={34} />
                  <View style={styles.commentBubble}>
                    <Text style={{ fontSize: 13, lineHeight: 18, color: colors.ink, fontWeight: "400" }}>
                      <Text style={{ fontWeight: "700" }}>
                        {item.user?.username ?? "rider"}  {" "}
                      </Text>
                      {item.content}
                    </Text>
                    <View style={styles.commentMeta}>
                      <T size={11} tone="muted">
                        {relativeTime(item.createdAt)}
                      </T>
                      {item.likeCount > 0 ? (
                        <T size={11} tone="muted">
                          {`${item.likeCount} ${item.likeCount === 1 ? "like" : "likes"}`}
                        </T>
                      ) : null}
                      <T size={11} weight="600" tone="muted">
                        Reply
                      </T>
                    </View>
                  </View>
                  <Pressable hitSlop={10} accessibilityLabel="Like comment">
                    <Ionicons
                      name={item.viewerLiked ? "heart" : "heart-outline"}
                      size={13}
                      color={item.viewerLiked ? "#FF3040" : colors.muted}
                    />
                  </Pressable>
                </View>
              )}
            />
          )}
          <Divider />
          <View style={styles.inputRow}>
            <Avatar user={user} size={36} />
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder={`Add a comment as ${user?.username ?? "rider"}…`}
              placeholderTextColor={colors.faint}
              keyboardAppearance={dark ? "dark" : "light"}
              multiline
              maxLength={500}
              style={[styles.commentInput, { color: colors.ink }]}
              returnKeyType="send"
              onSubmitEditing={send}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              hitSlop={8}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name="paper-plane-outline"
                  size={22}
                  color={draft.trim() ? colors.accent : colors.faint}
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
// MediaSlide — one swipeable slide: photo or playable video
//
// Single tap on a photo opens the post; double-tap likes. Videos play inline:
// tap the play badge to start (with sound), tap again to mute/unmute,
// double-tap to like. Each slide handles its own taps so swipes through the
// carousel never fight a parent gesture recogniser.
// ─────────────────────────────────────────────────────────────────────────────

function MediaSlide({
  item,
  width,
  onSingleTap,
  onDoubleTap,
}: {
  item: PostMedia;
  width: number;
  onSingleTap: () => void;
  onDoubleTap: () => void;
}) {
  const { colors } = usePalette();
  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handlePress(singleAction: () => void) {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      onDoubleTap();
    } else {
      lastTap.current = now;
      timer.current = setTimeout(() => {
        timer.current = null;
        singleAction();
      }, 300);
    }
  }

  if (item.type === "video") {
    const h = Math.min(
      520,
      Math.max(240, item.width && item.height ? (width * item.height) / item.width : width),
    );
    return (
      <View style={{ width, height: h, backgroundColor: "#000" }}>
        {/* Poster underneath — the video covers it once frames flow */}
        {item.posterUrl ? (
          <Image
            source={{ uri: item.posterUrl }}
            style={{ width, height: h, position: "absolute" }}
            contentFit="cover"
            transition={150}
          />
        ) : null}
        {started ? (
          <>
            <FeedVideo
              uri={item.url}
              style={{ width, height: h }}
              playing
              muted={muted}
            />
            {/* Tap surface: single = mute toggle, double = like */}
            <Pressable
              onPress={() => handlePress(() => setMuted((m) => !m))}
              accessibilityRole="button"
              accessibilityLabel={muted ? "Unmute video" : "Mute video"}
              style={StyleSheet.absoluteFill}
            />
            {/* Mute state pill + duration affordance */}
            <View style={styles.videoPillRow} pointerEvents="box-none">
              <Pressable
                onPress={() => setMuted((m) => !m)}
                accessibilityRole="button"
                accessibilityLabel={muted ? "Unmute video" : "Mute video"}
                hitSlop={10}
                style={styles.mutePill}
              >
                <Ionicons
                  name={muted ? "volume-mute" : "volume-high"}
                  size={15}
                  color="#fff"
                />
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            onPress={() => {
              setStarted(true);
              setMuted(false);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="Play video"
            style={[StyleSheet.absoluteFill, styles.playWrap]}
          >
            <View style={styles.playBadge}>
              <Ionicons name="play" size={26} color="#fff" />
            </View>
            <View style={styles.videoTag}>
              <Ionicons name="videocam" size={11} color="#fff" />
              <T size={10} weight="700" color="#fff" style={{ letterSpacing: 0.6 }}>
                VIDEO
              </T>
            </View>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <Pressable onPress={() => handlePress(onSingleTap)} accessibilityRole="imagebutton">
      <Image
        source={{ uri: item.posterUrl ?? item.url }}
        style={{
          width,
          aspectRatio: item.width && item.height ? item.width / item.height : 1,
          maxHeight: 520,
          backgroundColor: colors.raised,
        }}
        contentFit="cover"
        transition={150}
      />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PostCard — Instagram language
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
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const burstScale = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    openDetail: () => setCommentOpen(true),
  }));

  const liked =
    override && override.base === post.viewerLiked ? override.value : post.viewerLiked;
  const delta = liked === post.viewerLiked ? 0 : liked ? 1 : -1;
  const likeCount = Math.max(0, post.likeCount + delta);

  function fireBurst() {
    setBurstKey((k) => k + 1);
    burstScale.setValue(0);
    burstOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(burstScale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(burstOpacity, {
        toValue: 0,
        duration: 700,
        delay: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function doLike(next: boolean) {
    setOverride({ base: post.viewerLiked, value: next });
    queue.current = queue.current
      .then(() => actions?.like(post))
      .catch(() => setOverride(null));
  }

  function onToggleLike() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    doLike(!liked);
  }

  function onDoubleTapLike() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!liked) doLike(true);
    fireBurst();
  }

  function openComments() {
    setCommentOpen(true);
    actions?.comment(post);
  }

  function openMenu() {
    Alert.alert(
      `@${post.user?.username ?? "rider"}`,
      "What would you like to do?",
      [
        {
          text: "Share post",
          onPress: () => {
            if (actions?.share) actions.share(post);
            else {
              Share.share({ message: `RideWing post by @${post.user?.username ?? "rider"}: ${post.content.slice(0, 140)}` }).catch(() => {});
            }
          },
        },
        {
          text: saved ? "Remove from saved" : "Save post",
          onPress: () => {
            setSaved((s) => !s);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          },
        },
        { text: "View profile", onPress: () => openProfile() },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  function openProfile() {
    if (post.user?.username) {
      if (onOpenProfile) onOpenProfile(post.user.username);
      else router.push(`/profile/${post.user.username}`);
    }
  }

  const verified = !!post.user?.emailVerifiedAt;
  const author = post.user;
  const mediaWidth = width;
  const captionLong = post.content.length > 110;

  return (
    <>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable
            onPress={openProfile}
            accessibilityRole="button"
            accessibilityLabel={`Open ${author?.displayName ?? "rider"}'s profile`}
            hitSlop={4}
            style={styles.headerLeft}
          >
            <Avatar user={author} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <T size={14} weight="700" numberOfLines={1}>
                  {author?.username ?? "rider"}
                </T>
                {verified ? <VerifiedTick size={13} /> : null}
              </View>
              <T size={12} tone="muted" numberOfLines={1}>
                {post.repostedBy ? `Reposted by ${post.repostedBy.username} · ` : ""}
                {relativeTime(post.createdAt)}
              </T>
            </View>
          </Pressable>
          <Pressable onPress={openMenu} hitSlop={12} accessibilityLabel="More options" style={styles.moreBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.ink} />
          </Pressable>
        </View>

        {/* ── Media — full bleed, swipeable paging carousel ─────────
            Each slide owns its own tap handling so horizontal swipes never
            fight the tap recogniser: single tap opens comments (photos),
            double-tap likes, video has its own play + mute controls. */}
        {post.media.length ? (
          <View style={styles.mediaWrap}>
            <FlatList
              data={post.media}
              keyExtractor={(item, index) => `${item.url}-${index}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / mediaWidth);
                setActiveIndex(i);
              }}
              renderItem={({ item }) => (
                <MediaSlide
                  item={item}
                  width={mediaWidth}
                  onSingleTap={openComments}
                  onDoubleTap={onDoubleTapLike}
                />
              )}
            />
              {/* double-tap heart burst */}
              <Animated.View
                key={burstKey}
                pointerEvents="none"
                style={[
                  styles.burst,
                  {
                    opacity: burstOpacity,
                    transform: [{ scale: burstScale }],
                  },
                ]}
              >
                <Ionicons name="heart" size={92} color="#fff" style={styles.burstShadow} />
              </Animated.View>
              {/* paging dots */}
              {post.media.length > 1 ? (
                <View style={styles.dots}>
                  {post.media.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        { backgroundColor: i === activeIndex ? "#fff" : "rgba(255,255,255,0.45)" },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
              {post.media.length > 1 ? (
                <View style={styles.countPill}>
                  <T size={11} weight="700" color="#fff">
                    {`${activeIndex + 1}/${post.media.length}`}
                  </T>
                </View>
              ) : null}
            </View>
        ) : null}

        {/* ── Action bar ─────────────────────────────────────────── */}
        <View style={styles.actions}>
          <View style={styles.actionsLeft}>
            <Pressable onPress={onToggleLike} hitSlop={10} accessibilityRole="button" accessibilityLabel={liked ? "Unlike" : "Like"}>
              <Animated.View>
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={27}
                  color={liked ? "#FF3040" : colors.ink}
                />
              </Animated.View>
            </Pressable>
            <Pressable onPress={openComments} hitSlop={10} accessibilityLabel="Comment">
              <Ionicons name="chatbubble-outline" size={25} color={colors.ink} style={{ transform: [{ scaleX: -1 }] }} />
            </Pressable>
            <Pressable
              onPress={() => actions?.repost(post)}
              hitSlop={10}
              accessibilityLabel="Repost"
            >
              <Ionicons
                name="repeat-outline"
                size={26}
                color={post.viewerReposted ? colors.accent : colors.ink}
              />
            </Pressable>
            <Pressable
              onPress={() => (actions?.share ? actions.share(post) : openComments())}
              hitSlop={10}
              accessibilityLabel="Share"
            >
              <Ionicons name="paper-plane-outline" size={25} color={colors.ink} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              setSaved((s) => !s);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }}
            hitSlop={10}
            accessibilityLabel={saved ? "Unsave" : "Save"}
          >
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={25} color={colors.ink} />
          </Pressable>
        </View>

        {/* ── Likes ──────────────────────────────────────────────── */}
        {likeCount > 0 ? (
          <Pressable onPress={openComments} style={styles.likesRow}>
            <T size={14} weight="700">
              {`${likeCount} ${likeCount === 1 ? "like" : "likes"}`}
            </T>
          </Pressable>
        ) : null}

        {/* ── Caption — single Text with styled spans (nested custom
            components here blank out on some Android builds) ────── */}
        {post.content ? (
          <Pressable onPress={() => captionLong && setExpanded((e) => !e)} style={styles.caption}>
            <Text
              numberOfLines={expanded ? undefined : 2}
              style={{ fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: "400" }}
            >
              <Text style={{ fontWeight: "700" }}>{author?.username ?? "rider"}  </Text>
              {expanded || !captionLong ? post.content : `${post.content.slice(0, 110)}… `}
              {!expanded && captionLong ? (
                <Text style={{ color: colors.muted }}>more</Text>
              ) : null}
            </Text>
          </Pressable>
        ) : null}

        {/* ── Comments link + time ───────────────────────────────── */}
        {post.commentCount > 0 ? (
          <Pressable onPress={openComments} style={styles.viewComments}>
            <T size={14} tone="muted">
              {`View all ${post.commentCount} comment${post.commentCount === 1 ? "" : "s"}`}
            </T>
          </Pressable>
        ) : null}
        <View style={styles.timeRow}>
          <T size={11} tone="muted" style={{ letterSpacing: 0.4 }}>
            {relativeTime(post.createdAt).toUpperCase()}
          </T>
          {post.repostCount > 0 ? (
            <T size={11} tone="muted">
              {`· ${post.repostCount} repost${post.repostCount === 1 ? "" : "s"}`}
            </T>
          ) : null}
        </View>
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

export { fmt as formatCount };

const styles = StyleSheet.create({
  card: {
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  moreBtn: {
    padding: 4,
  },
  mediaWrap: {
    position: "relative",
    backgroundColor: "#000",
  },
  videoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  playWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.85)",
  },
  burst: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  burstShadow: {
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  countPill: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  videoPillRow: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    gap: 8,
  },
  mutePill: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  videoTag: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 2,
  },
  actionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  likesRow: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  caption: {
    paddingHorizontal: 12,
    paddingTop: 3,
  },
  viewComments: {
    paddingHorizontal: 12,
    paddingTop: 3,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 5,
  },
  sheetWrapper: {},
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "82%",
    minHeight: 320,
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
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetSpinner: {
    paddingVertical: 32,
    alignItems: "center",
  },
  commentList: {
    padding: 16,
    gap: 16,
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  commentBubble: {
    flex: 1,
    gap: 3,
  },
  commentMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
});
