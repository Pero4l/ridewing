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
 * Upload an image straight to the API as multipart form data.
 *
 * `XMLHttpRequest` rather than `fetch`, because React Native's `fetch` cannot
 * send a FormData file part with the filename and content type the multer
 * middleware expects.
 */
async function uploadImage(uri: string, mimeType: string): Promise<PostMedia> {
  // The extension and type come from the asset itself: the picker may hand
  // back a PNG or HEIC, and the upload middleware's file filter rejects
  // parts whose declared type is not a real image type.
  const extension = (mimeType.split("/")[1] ?? "jpeg").split("+")[0];
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
      xhr.open("POST", `${getBaseUrl()}/api/upload/image`);
      const token = getAccessToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(form);
    },
  );

  // The upload endpoint answers `{ media: { url, width, height } }`.
  // Reading `body.url` — which is always undefined — is what made every
  // photo upload fail with "Could not upload that photo."
  const body = JSON.parse(text || "{}") as {
    media?: { url?: string; width?: number | null; height?: number | null };
    error?: { message?: string };
  };
  if (status >= 200 && status < 300 && body.media?.url) {
    return {
      url: body.media.url,
      type: "image",
      width: body.media.width ?? undefined,
      height: body.media.height ?? undefined,
    };
  }
  throw new Error(body.error?.message ?? "Could not upload that photo.");
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ComposeScreen() {
  const { colors } = usePalette();
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

  async function pickImage() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("RideWing needs access to your photos to attach one to a post.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadImage(asset.uri, asset.mimeType ?? "image/jpeg");
      setMedia((current) => [...current, uploaded].slice(0, 9));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that photo.");
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

          {/* Photo strip */}
          {media.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              {media.map((item, index) => (
                <View key={item.url} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: item.url }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                  {/* Remove overlay */}
                  <Pressable
                    onPress={() => removeMedia(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
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

        {/* ── bottom toolbar ───────────────────────────────────────────────── */}
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
          <Pressable
            onPress={pickImage}
            disabled={uploading || media.length >= 9}
            accessibilityRole="button"
            accessibilityLabel={uploading ? "Uploading photo…" : "Add photo"}
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
