import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Card, Row, Screen, T } from "@/components/ui";
import { ApiError, api, getAccessToken, getBaseUrl } from "@/lib/api";
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

export default function ComposeScreen() {
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const ready = content.trim().length > 0 || media.length > 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card className="gap-4">
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="What are you riding?"
            multiline
            maxLength={2000}
            className="min-h-[120px] text-[16px] text-ink"
            // Vertical alignment for the multiline box; RN has no class for it.
            style={{ textAlignVertical: "top" }}
          />

          {media.length ? (
            <View className="flex-row flex-wrap gap-2">
              {media.map((item, index) => (
                <Pressable
                  key={item.url}
                  onPress={() => setMedia((c) => c.filter((_, i) => i !== index))}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Image
                    source={{ uri: item.url }}
                    className="h-24 w-24 rounded-lg bg-raised"
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </View>
          ) : null}

          <ErrorBanner message={error} />

          <Row className="justify-between">
            <Button
              label={uploading ? "Uploading…" : "Add photo"}
              icon="image-outline"
              variant="secondary"
              loading={uploading}
              disabled={media.length >= 9}
              onPress={pickImage}
            />
            <Button label="Post" onPress={publish} loading={busy} disabled={!ready} />
          </Row>

          <T size={11} muted>
            {content.length}/2000 · {media.length}/9 photos
          </T>
        </Card>
      </ScrollView>
    </Screen>
  );
}