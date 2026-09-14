"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { uploadFile, MAX_UPLOAD_IMAGE_SIZE_MB } from "@/lib/upload";
import { SpinnerIcon } from "@/components/spinner";
import { CameraIcon, ImageIcon, VideoIcon, XIcon, UploadIcon } from "@/components/icons";

type ImageUploadFieldProps = {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  aspect?: "square" | "wide";
};

export function ImageUploadField({ label, value, onChange, hint, aspect = "square" }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const media = await uploadFile("image", file, setProgress);
      onChange(media.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      {label && (
        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      )}
      <div className="flex items-center gap-3">
        <div
          className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500 ${
            aspect === "square" ? "h-20 w-20" : "h-16 w-28"
          }`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <CameraIcon size={22} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={progress !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 shadow-xs transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {progress !== null ? <SpinnerIcon size={15} className="animate-spin" /> : <UploadIcon size={15} />}
            {progress !== null ? `Uploading ${progress}%` : value ? "Change" : "Upload"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex h-8 items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            >
              <XIcon size={13} /> Remove
            </button>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {!error && hint && <p className="text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

export type PickedMedia = {
  mediaId: string;
  kind: "image" | "video";
  url: string;
  width: number | null;
  height: number | null;
};

const ACCEPTED_TYPES: Record<"image" | "video", { ext: string; mime: string[]; maxBytes: number }> = {
  image: { ext: "image/*", mime: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic"], maxBytes: 10 * 1024 * 1024 },
  video: { ext: "video/*", mime: ["video/mp4", "video/webm", "video/quicktime"], maxBytes: 100 * 1024 * 1024 },
};

/**
 * Drag-and-drop / tap-to-pick image + single-video collector for posts.
 */
export function MediaPicker({
  value,
  onChange,
  maxImages = 9,
  disabled = false,
  onError,
}: {
  value: PickedMedia[];
  onChange: (media: PickedMedia[]) => void;
  maxImages?: number;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const imageCount = value.filter((m) => m.kind === "image").length;
  const hasVideo = value.some((m) => m.kind === "video");

  async function handleFiles(list: FileList | null, kind: "image" | "video") {
    if (!list?.length) return;
    const next = [...value];
    const files = Array.from(list).slice(0, Math.max(1, maxImages - imageCount));

    for (const file of files) {
      const spec = ACCEPTED_TYPES[kind];
      if (!spec.mime.includes(file.type)) {
        onError?.(
          kind === "image"
            ? `${file.name} skipped — unsupported format. Use JPEG, PNG, WebP, GIF or AVIF.`
            : `${file.name} skipped — unsupported format. Use MP4 or WebM.`,
        );
        continue;
      }
      if (file.size > spec.maxBytes) {
        onError?.(`${file.name} skipped — larger than ${(spec.maxBytes / (1024 * 1024)).toFixed(0)} MB.`);
        continue;
      }
      setUploading(true);
      try {
        const media = await uploadFile(kind, file);
        next.push({ mediaId: media.url, kind, url: media.url, width: media.width, height: media.height });
      } catch (uploadError) {
        onError?.(uploadError instanceof Error ? uploadError.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    }
    onChange(next);
  }

  function remove(entry: PickedMedia) {
    onChange(value.filter((m) => m.mediaId !== entry.mediaId));
  }

  const showImageButton = imageCount < maxImages;
  const showVideoButton = !hasVideo;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((entry) => (
            <div key={entry.mediaId} className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
              {entry.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <video src={entry.url} className="h-full w-full object-cover" muted playsInline />
              )}
              <button
                type="button"
                onClick={() => remove(entry)}
                aria-label="Remove media"
                className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <XIcon size={13} />
              </button>
              {entry.kind === "video" && (
                <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <VideoIcon size={10} /> Video
                </span>
              )}
            </div>
          ))}
          {(showImageButton || showVideoButton) && (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => imageRef.current?.click()}
              className="grid aspect-square place-items-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-500 disabled:opacity-50 dark:border-zinc-700"
              aria-label="Add media"
            >
              {uploading ? <SpinnerIcon size={18} className="animate-spin" /> : <ImageIcon size={18} />}
              {mediaLabel(maxImages)}
            </button>
          )}
        </div>
      )}

      {value.length === 0 && (
        <div className="flex items-center gap-2">
          {showImageButton && (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => imageRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-600 shadow-xs transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {uploading ? <SpinnerIcon size={15} className="animate-spin" /> : <ImageIcon size={15} />}
              Photos
            </button>
          )}
          {showVideoButton && (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => videoRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-600 shadow-xs transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <VideoIcon size={15} /> Video
            </button>
          )}
        </div>
      )}

      <input ref={imageRef} type="file" accept={ACCEPTED_TYPES.image.ext} multiple className="hidden" onChange={(e) => void handleFiles(e.target.files, "image")} aria-hidden tabIndex={-1} />
      <input ref={videoRef} type="file" accept={ACCEPTED_TYPES.video.ext} className="hidden" onChange={(e) => void handleFiles(e.target.files, "video")} aria-hidden tabIndex={-1} />
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        {showImageButton ? <>Up to {Math.min(maxImages, 9)} photos ({MAX_UPLOAD_IMAGE_SIZE_MB} MB each). </> : null}
        {showVideoButton ? "One video (100 MB, mp4/webm/mov)." : null}
      </p>
    </div>
  );
}

function mediaLabel(maxImages: number) {
  return maxImages > 1 ? `+${maxImages - 1}` : "";
}