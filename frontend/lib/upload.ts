"use client";

import { API_URL, getAccessToken, refreshSession } from "./api";

export type UploadedMedia = {
  url: string;
  width: number | null;
  height: number | null;
  format: string | null;
  type: "image" | "video";
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_POST_IMAGES = 9;

export const MAX_UPLOAD_IMAGE_SIZE_MB = MAX_IMAGE_BYTES / (1024 * 1024);
export const MAX_UPLOAD_VIDEO_SIZE_MB = MAX_VIDEO_BYTES / (1024 * 1024);

function parseError(status: number, text: string): Error {
  try {
    const body = JSON.parse(text) as { error?: { message?: string } };
    return new Error(body.error?.message ?? "Upload failed");
  } catch {
    return new Error(status >= 500 ? "Server error during upload" : "Upload failed");
  }
}

function send(kind: "image" | "video", file: File, onProgress?: (percentage: number) => void): Promise<MediaUploadResult> {
  const form = new FormData();
  form.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/upload/${kind}`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { media?: UploadedMedia };
          if (body.media) return resolve({ media: body.media });
        } catch {
          /* fall through to rejection */
        }
        return reject(new Error("Invalid upload response"));
      }
      if (xhr.status === 401) {
        return resolve({ status: 401 });
      }
      reject(parseError(xhr.status, xhr.responseText));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));

    xhr.send(form);
  });
}

type MediaUploadResult =
  | { media: UploadedMedia }
  | { status: 401 };

/**
 * Uploads a file to the API with progress reporting. If the access token has
 * expired, it refreshes the session first and retries the upload once.
 */
export async function uploadFile(
  kind: "image" | "video",
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<UploadedMedia> {
  const first = await send(kind, file, onProgress);
  if ("status" in first && (await refreshSession())) {
    const retry = await send(kind, file, onProgress);
    if ("media" in retry) return retry.media;
    throw new Error("Upload failed");
  }
  if ("media" in first) return first.media;
  throw new Error("You need to sign in again to upload media");
}