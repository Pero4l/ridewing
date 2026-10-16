import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorBanner } from "@/components/auth";
import { Avatar, Screen, T } from "@/components/ui";
import { ApiError, api, getAccessToken, getBaseUrl } from "@/lib/api";
import { usePalette } from "@/lib/palette";
import { useSession } from "@/lib/session";
import type { Post, PostMedia } from "@/lib/types";

/**
 * Uploads a picked asset straight to the API as multipart form data.
 *
 * `XMLHttpRequest` rather than `fetch`, because React Native's `fetch` cannot
 * send a FormData file part with the filename and content type the multer
 * middleware expects.
 */
async function uploadMedia(
  uri: string,
  mimeType: string,
  kind: "image" | "video",
): Promise<PostMedia> {
  const extension = (mimeType.split("/")[1] ?? (kind === "video" ? "mp4" : "jpeg")).split("+")[0];
  const form = new FormData();
  // React Native's FormData accepts this {uri,name,type} shape for a file.
  form.append("file", {
    uri,
    name: `upload-${Date.now()}.${extension}`,
    type: mimeType,
  } as unknown as Blob);

  // XHR (not fetch) because React Native's fetch cannot send a FormData part
  // with the filename and content type the multer middleware expects.
  const { status, text } = await new Promise<{ status: number; text: string }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${getBaseUrl()}/api/upload/${kind}`);
      const token = getAccessToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(form);
    },
  );

  // The upload endpoint answers `{ media: { url, width, height, ... } }`.
  // Reading `body.url` — which is always undefined — is what made every
  // photo upload fail with "Could not upload that photo."
  const body = JSON.parse(text || "{}") as {
    media?: {
      url?: string;
      width?: number | null;
      height?: number | null;
      posterUrl?: string;
      duration?: number | null;
    };
    error?: { message?: string };
  };
  if (status >= 200 && status < 300 && body.media?.url) {
    return {
      url: body.media.url,
      type: kind,
      width: body.media.width ?? undefined,
      height: body.media.height ?? undefined,
      posterUrl: body.media.posterUrl,
    };
  }
  throw new Error(body.error?.message ?? `Could not upload that ${kind === "video" ? "video" : "photo"}.`);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ComposeScreen() {
  const { colors, dark } = usePalette();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [content, setContent] = useState("");
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const ready = content.trim().length > 0 || media.length > 0;
  const remaining = 2000 - content.length;

  // ── actions ────────────────────────────────────────────────────────────────

  async function pickImages() {
    setError(null);
    const slots = 9 - media.length;
    if (slots <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("RideWing needs access to your photos to attach them to a post.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: slots,
    });
    if (result.canceled || !result.assets.length) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        const uploaded = await uploadMedia(asset.uri, asset.mimeType ?? "image/jpeg", "image");
        setMedia((current) => [...current, uploaded].slice(0, 9));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload those photos.");
    } finally {
      setUploading(false);
    }
  }

  async function pickVideo() {
    setError(null);
    if (media.length >= 9) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("RideWing needs access to your videos to attach one to a post.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: false,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    // `duration` is milliseconds. The backend caps uploads well above a
    // minute, but reels are a 60-second format — reject early with a clear
    // message instead of a mysterious server error.
    if (asset.duration != null && asset.duration > 65_000) {
      setError("Keep videos to 60 seconds or less.");
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadMedia(asset.uri, asset.mimeType ?? "video/mp4", "video");
      setMedia((current) => [...current, uploaded].slice(0, 9));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that video.");
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ post: Post }>("/api/posts", {
        content: content.trim() || undefined,
        media: media.length ? media : undefined,
      });
      router.replace(`/post/${res.post.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish your post.");
      setBusy(false);
    }
  }

  function removeMedia(index: number) {
    setMedia((c) => c.filter((_, i) => i !== index));
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* ── top toolbar ─────────────────────────────────────────────────── */}
        <View
          style={[
            styles.toolbar,
            {
              paddingTop: insets.top + 10,
              borderBottomColor: colors.hairline,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={12}
            style={styles.toolbarSide}
          >
            <T size={16} weight="500" color={colors.accent}>
              Cancel
            </T>
          </Pressable>

          <T size={16} weight="700">
            New Post
          </T>

          <View style={[styles.toolbarSide, styles.toolbarRight]}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <Pressable
                onPress={publish}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityLabel="Post"
                accessibilityState={{ disabled: !ready }}
                style={[
                  styles.postPill,
                  {
                    backgroundColor: ready ? colors.accent : colors.raised,
                  },
                ]}
              >
                <T
                  size={14}
                  weight="700"
                  color={ready ? colors.onAccent : colors.faint}
                >
                  Post
                </T>
              </Pressable>
            )}
          </View>
        </View>

        {/* ── body ────────────────────────────────────────────────────────── */}
        <ScrollView
          style={[styles.flex, { backgroundColor: colors.surface }]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorWrap}>
              <ErrorBanner message={error} />
            </View>
          ) : null}

          {/* Avatar + text input row */}
          <View style={styles.inputRow}>
            <Avatar user={user} size={40} />

            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="What are you riding?"
              placeholderTextColor={colors.faint}
              keyboardAppearance={dark ? "dark" : "light"}
              multiline
              maxLength={2000}
              autoFocus
              style={[
                styles.textInput,
                { color: colors.ink },
              ]}
              textAlignVertical="top"
            />
          </View>

          {/* Media strip — photos and videos, in post order */}
          {media.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              {media.map((item, index) => (
                <View key={`${item.url}-${index}`} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: item.type === "video" ? (item.posterUrl ?? item.url) : item.url }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                  {item.type === "video" ? (
                    <View style={styles.videoBadge}>
                      <Ionicons name="play" size={16} color="#fff" />
                    </View>
                  ) : null}
                  {/* Remove overlay */}
                  <Pressable
                    onPress={() => removeMedia(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.type === "video" ? "video" : "photo"}`}
                    style={[
                      styles.removeBtn,
                      { backgroundColor: colors.ink + "CC" },
                    ]}
                  >
                    <Ionicons name="close" size={12} color={colors.surface} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </ScrollView>

        {/* ── bottom toolbar: photos, video, counters ────────────────── */}
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: insets.bottom + 8,
              borderTopColor: colors.hairline,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={styles.attachRow}>
            <Pressable
              onPress={pickImages}
              disabled={uploading || media.length >= 9}
              accessibilityRole="button"
              accessibilityLabel={uploading ? "Uploading…" : "Add photos"}
              hitSlop={8}
              style={[
                styles.photoBtn,
                (uploading || media.length >= 9) && styles.photoBtnDisabled,
              ]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name="image-outline"
                  size={24}
                  color={media.length >= 9 ? colors.faint : colors.accent}
                />
              )}
            </Pressable>
            <Pressable
              onPress={pickVideo}
              disabled={uploading || media.length >= 9}
              accessibilityRole="button"
              accessibilityLabel={uploading ? "Uploading…" : "Add a video (up to 60 seconds)"}
              hitSlop={8}
              style={[
                styles.photoBtn,
                (uploading || media.length >= 9) && styles.photoBtnDisabled,
              ]}
            >
              <Ionicons
                name="videocam-outline"
                size={24}
                color={media.length >= 9 ? colors.faint : colors.accent}
              />
            </Pressable>
            {media.length > 0 ? (
              <T size={12} weight="600" tone="muted">
                {`${media.length}/9`}
              </T>
            ) : null}
          </View>

          <T size={12} color={remaining < 100 ? colors.warning : colors.faint}>
            {remaining}
          </T>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const THUMB_SIZE = 80;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // Top toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarSide: {
    width: 80,
  },
  toolbarRight: {
    alignItems: "flex-end",
  },
  postPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  // Scroll body
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  errorWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  // Avatar + input row
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    paddingTop: 0, // align baseline with avatar top
  },
  // Photo strip
  photoStrip: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  thumbWrap: {
    position: "relative",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: "hidden",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // Bottom toolbar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  photoBtn: {
    padding: 4,
  },
  photoBtnDisabled: {
    opacity: 0.4,
  },
});
