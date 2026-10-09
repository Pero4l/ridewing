import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { Avatar, Badge, Card, Divider, Row, T } from "./ui";
import { relativeTime } from "@/lib/format";
import type { Post } from "@/lib/types";

export type PostActions = {
  like: (post: Post) => void;
  repost: (post: Post) => void;
  comment: (post: Post) => void;
  /** Opens the rider picker to send the post into a conversation. */
  share?: (post: Post) => void;
};

/**
 * A single post.
 *
 * The optimistic like lives here rather than in the feed, keyed to the props it
 * was derived from so it self-heals once the server catches up. Requests are
 * chained, so a fast double-tap cannot land out of order.
 */
export const PostCard = forwardRef<
  { openDetail: () => void },
  { post: Post; onOpenProfile?: (username: string) => void; actions?: PostActions }
>(function PostCard({ post, onOpenProfile, actions }, ref) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [override, setOverride] = useState<{ base: boolean; value: boolean } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useImperativeHandle(ref, () => ({ openDetail: () => router.push(`/post/${post.id}`) }));

  const liked = override && override.base === post.viewerLiked ? override.value : post.viewerLiked;
  const delta = liked === post.viewerLiked ? 0 : liked ? 1 : -1;
  const likeCount = Math.max(0, post.likeCount + delta);

  function onToggleLike() {
    const next = !liked;
    setOverride({ base: post.viewerLiked, value: next });
    queue.current = queue.current
      .then(() => actions?.like(post))
      .catch(() => setOverride(null));
  }

  const contentWidth = Math.min(width, 640) - 32;

  return (
    <Card className="gap-2.5">
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
        <Row gap={10}>
          <Avatar user={post.user} />
          <View className="flex-1">
            <Row gap={1.5}>
              <T size={14} weight="700" numberOfLines={1} className="shrink">
                {post.user?.displayName ?? "Rider"}
              </T>
              {post.repostedBy ? (
                <T size={12} tone="muted" numberOfLines={1}>
                  reposted
                </T>
              ) : null}
            </Row>
            <T size={12} tone="muted">
              @{post.user?.username} · {relativeTime(post.createdAt)}
            </T>
          </View>
          {post.editedAt ? <Badge label="edited" tone="muted" /> : null}
        </Row>
      </Pressable>

      {post.content ? <T size={15}>{post.content}</T> : null}

      {post.media.length ? (
        <View className="gap-1">
          {post.media.map((item, index) => (
            <Pressable
              key={`${item.url}-${index}`}
              onPress={() => router.push(`/post/${post.id}`)}
              accessibilityRole="imagebutton"
              accessibilityLabel="Open post"
            >
              {item.type === "video" ? (
                <View
                  className="items-center justify-center rounded-lg bg-raised"
                  style={{ height: contentWidth * 0.5625 }}
                >
                  <T size={13} tone="muted">
                    Video
                  </T>
                </View>
              ) : (
                <Image
                  source={{ uri: item.posterUrl ?? item.url }}
                  className="w-full rounded-lg bg-raised"
                  style={{
                    aspectRatio: item.width && item.height ? item.width / item.height : 1.5,
                    maxHeight: 420,
                  }}
                  contentFit="cover"
                  transition={150}
                />
              )}
            </Pressable>
          ))}
        </View>
      ) : null}

      <Divider />

      <View className="flex-row items-center justify-between pt-0.5">
        <Action
          icon={liked ? "heart" : "heart-outline"}
          label={likeCount > 0 ? `${likeCount}` : "Like"}
          tone={liked ? "danger" : "muted"}
          accessibilityLabel={liked ? "Unlike" : "Like"}
          onPress={onToggleLike}
        />
        <Action
          icon="chatbubble-outline"
          label={post.commentCount > 0 ? `${post.commentCount}` : "Comment"}
          accessibilityLabel="Comment"
          onPress={() => actions?.comment(post)}
        />
        <Action
          icon="repeat"
          label={post.repostCount > 0 ? `${post.repostCount}` : "Repost"}
          accessibilityLabel="Repost"
          onPress={() => actions?.repost(post)}
        />
        <Action
          icon={post.shareCount > 0 ? "paper-plane" : "paper-plane-outline"}
          label={post.shareCount > 0 ? `${post.shareCount}` : "Share"}
          accessibilityLabel="Share this post with a rider"
          onPress={() => (actions?.share ? actions.share(post) : router.push(`/post/${post.id}`))}
        />
      </View>
    </Card>
  );
});

/**
 * One action in the post footer. The count sits beside the glyph rather than
 * under it, which keeps a four-up row inside a phone-width card without
 * shrinking the tap target.
 */
function Action({
  icon,
  label,
  tone = "muted",
  accessibilityLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: "muted" | "danger" | "accent";
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const tint = tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-muted";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      className="flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 active:bg-raised"
    >
      <Ionicons name={icon} size={18} className={tint} />
      <T size={13} weight="600" className={tint}>
        {label}
      </T>
    </Pressable>
  );
}