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
          {progress !== null && (
            <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden dark:bg-zinc-700">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
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
  posterUrl?: string;
};

const ACCEPTED_TYPES: Record<"image" | "video", { ext: string; mime: string[]; maxBytes: number }> = {
  image: { ext: "image/*", mime: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic"], maxBytes: 10 * 1024 * 1024 },
  video: { ext: "video/*", mime: ["video/mp4", "video/webm", "video/quicktime"], maxBytes: 100 * 1024 * 1024 },
};

/**
 * Drag-and-drop / tap-to-pick image + single-video collector for posts.
 * Uploads multiple images in parallel for faster performance.
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
  const [uploadProgress, setUploadProgress] = useState<Record<string, { progress: number; fileName: string }>>({});

  const imageCount = value.filter((m) => m.kind === "image").length;
  const hasVideo = value.some((m) => m.kind === "video");
  const isUploading = Object.keys(uploadProgress).length > 0;

  async function handleFiles(list: FileList | null, kind: "image" | "video") {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, Math.max(1, maxImages - imageCount));

    // Validate all files first
    const validFiles: File[] = [];
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
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Upload all valid files in parallel
    const uploadPromises = validFiles.map(async (file) => {
      const uploadKey = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploadProgress((prev) => ({ ...prev, [uploadKey]: { progress: 0, fileName: file.name } }));
      
      try {
        const media = await uploadFile(kind, file, (p) => 
          setUploadProgress((prev) => ({ ...prev, [uploadKey]: { ...prev[uploadKey], progress: p } }))
        );
        return { success: true as const, media, uploadKey };
      } catch (uploadError) {
        return { success: false as const, error: uploadError instanceof Error ? uploadError.message : "Upload failed", uploadKey };
      }
    });

    const results = await Promise.all(uploadPromises);
    
    const next = [...value];
    for (const result of results) {
      if (result.success) {
        next.push({
          mediaId: result.media.url,
          kind,
          url: result.media.url,
          width: result.media.width,
          height: result.media.height,
          posterUrl: result.media.posterUrl,
        });
      } else {
        onError?.(`${result.error}`);
      }
      // Clean up progress after a short delay for visual feedback
      setTimeout(() => {
        setUploadProgress((prev) => {
          const copy = { ...prev };
          delete copy[result.uploadKey];
          return copy;
        });
      }, 500);
    }
    
    onChange(next);
  }

  function remove(entry: PickedMedia) {
    if (disabled) return;
    onChange(value.filter((m) => m.mediaId !== entry.mediaId));
  }

  const showImageButton = imageCount < maxImages;
  const showVideoButton = !hasVideo;

  return (
    <div className="space-y-3">
      {/* Upload progress bars */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          {Object.entries(uploadProgress).map(([key, { progress, fileName }]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[120px]">{fileName}</span>
              <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden dark:bg-zinc-700">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-200 ease-out" 
                  style={{ width: `${progress}%` }} 
                />
              </div>
              <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 w-10 text-right">{progress}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Media grid preview with always-visible remove buttons */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {value.map((entry, index) => (
            <div 
              key={entry.mediaId} 
              className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 animate-in fade-in zoom-95 duration-200"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              {entry.kind === "image" ? (
                <img 
                  src={entry.url} 
                  alt="" 
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" 
                  loading="lazy"
                />
              ) : (
                <video 
                  src={entry.url} 
                  poster={entry.posterUrl} 
                  className="h-full w-full object-cover" 
                  muted 
                  playsInline 
                  preload="metadata"
                />
              )}
              
              {/* Video badge */}
              {entry.kind === "video" && (
                <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
                  <VideoIcon size={10} /> Video
                </span>
              )}

              {/* Always-visible remove button with better UX */}
              <button
                type="button"
                onClick={() => remove(entry)}
                aria-label={`Remove ${entry.kind}`}
                className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 shadow-md opacity-60 hover:opacity-100 hover:scale-110 transition-all duration-200 focus:opacity-100 focus:scale-110 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <XIcon size={14} />
              </button>

              {/* Index number for ordering */}
              <span className="absolute top-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 dark:bg-zinc-900/90 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
                {index + 1}
              </span>
            </div>
          ))}

          {/* Add media button */}
          {(showImageButton || showVideoButton) && (
            <label className="group cursor-pointer">
              <input
                ref={imageRef}
                type="file"
                accept={ACCEPTED_TYPES.image.ext}
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files, "image")}
                aria-hidden
                tabIndex={-1}
                disabled={disabled || isUploading}
              />
              <div className="group relative aspect-square grid place-items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 text-zinc-400 transition-all duration-200 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 disabled:opacity-50 dark:border-zinc-700">
                {isUploading ? (
                  <SpinnerIcon size={22} className="animate-spin text-emerald-500" />
                ) : (
                  <>
                    <ImageIcon size={22} />
                    <span className="text-xs font-medium">Add more</span>
                  </>
                )}
                {mediaLabel(maxImages) && (
                  <span className="absolute bottom-1 right-1 text-[10px] font-bold text-zinc-400 group-hover:text-emerald-500 transition-colors">
                    +{maxImages - imageCount}
                  </span>
                )}
              </div>
            </label>
          )}
        </div>
      )}

      {/* Empty state with drag-and-drop hint */}
      {value.length === 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/50">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
                <ImageIcon size={28} className="text-zinc-400 dark:text-zinc-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Add photos & videos</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Tap or drag files here</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2">
            {showImageButton && (
              <label className="cursor-pointer">
                <input
                  ref={imageRef}
                  type="file"
                  accept={ACCEPTED_TYPES.image.ext}
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files, "image")}
                  aria-hidden
                  tabIndex={-1}
                  disabled={disabled || isUploading}
                />
                <button
                  type="button"
                  disabled={disabled || isUploading}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-xs transition-all hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/20"
                >
                  <ImageIcon size={16} />
                  <span>Photos</span>
                </button>
              </label>
            )}
            {showVideoButton && (
              <label className="cursor-pointer">
                <input
                  ref={videoRef}
                  type="file"
                  accept={ACCEPTED_TYPES.video.ext}
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files, "video")}
                  aria-hidden
                  tabIndex={-1}
                  disabled={disabled || isUploading}
                />
                <button
                  type="button"
                  disabled={disabled || isUploading}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-xs transition-all hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/20"
                >
                  <VideoIcon size={16} />
                  <span>Video</span>
                </button>
              </label>
            )}
          </div>
          
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            {showImageButton ? <>Up to {Math.min(maxImages, 9)} photos ({MAX_UPLOAD_IMAGE_SIZE_MB} MB each). </> : null}
            {showVideoButton ? "One video (100 MB, mp4/webm/mov)." : null}
          </p>
        </div>
      )}
    </div>
  );
}

function mediaLabel(maxImages: number) {
  return maxImages > 1 ? `+${maxImages - 1}` : "";
}