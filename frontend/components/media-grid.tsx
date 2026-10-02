"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PostMedia } from "@/lib/types";
import { VideoIcon, XIcon, Volume2Icon, VolumeXIcon, ExpandIcon } from "@/components/icons";

export function MediaGrid({ media, preview = true, onVideoClick }: { media: PostMedia[]; preview?: boolean; onVideoClick?: (url: string, posterUrl?: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  if (!media.length) return null;

  if (!preview) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {media.map((item) =>
          item.type === "video" ? <VideoTile key={item.url} item={item} compact onVideoClick={onVideoClick} /> : <ImageTile key={item.url} item={item} />,
        )}
      </div>
    );
  }

  if (media.length <= 4) {
    const count = media.length;
    const columns =
      count === 1 ? "grid-cols-1" : count === 3 ? "grid-cols-2 [&>*:first-child]:col-span-2 [&>*:first-child]:row-span-2" : "grid-cols-2";
    return (
      <div className={`grid gap-1.5 ${columns}`}>
        {media.map((item) =>
          item.type === "video" ? <VideoTile key={item.url} item={item} compact={count > 1} /> : <ImageTile key={item.url} item={item} />,
        )}
      </div>
    );
  }

  const overflowCount = media.length - 4;
  const previewItems = media.slice(0, 4);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {previewItems.map((item, index) => {
          if (index === 3) {
            return (
              <TileButton key={item.url} onOpen={() => setExpanded((value) => !value)}>
                <MediaThumb item={item} />
                <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-[2px]">
                  <span className="text-3xl font-bold text-white">+{overflowCount}</span>
                </div>
              </TileButton>
            );
          }
          return item.type === "video" ? <VideoTile key={item.url} item={item} compact onVideoClick={onVideoClick} /> : <ImageTile key={item.url} item={item} />;
        })}
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-1.5">
          {media.map((item) =>
            item.type === "video" ? <VideoTile key={item.url} item={item} compact onVideoClick={onVideoClick} /> : <ImageTile key={item.url} item={item} />,
          )}
        </div>
      )}
    </div>
  );
}

function TileButton({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square touch-pan-y overflow-hidden rounded-lg bg-zinc-100 select-none dark:bg-zinc-800"
    >
      {children}
    </button>
  );
}

function MediaThumb({ item }: { item: PostMedia }) {
  if (item.type === "video") {
    return (
      <video
        src={item.url}
        poster={item.posterUrl}
        muted
        loop
        playsInline
        preload="none"
        className="h-full w-full bg-zinc-200 object-cover dark:bg-zinc-800"
        onMouseEnter={(event) => void event.currentTarget.play()}
        onMouseLeave={(event) => {
          event.currentTarget.pause();
          event.currentTarget.currentTime = 0;
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt="Post photo"
      loading="lazy"
      draggable={false}
      className="h-full w-full touch-pan-y object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}

function ImageTile({ item }: { item: PostMedia }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TileButton onOpen={() => setOpen(true)}>
        <MediaThumb item={item} />
      </TileButton>
      {open && <ImageLightbox url={item.url} onClose={() => setOpen(false)} />}
    </>
  );
}

function VideoTile({ item, compact, onVideoClick }: { item: PostMedia; compact: boolean; onVideoClick?: (url: string, posterUrl?: string) => void }) {
  if (compact) {
    return (
      <TileButton onOpen={() => onVideoClick?.(item.url, item.posterUrl)}>
        <video
          src={item.url}
          poster={item.posterUrl}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <VideoBadge />
      </TileButton>
    );
  }
  return (
    <TileButton onOpen={() => onVideoClick?.(item.url, item.posterUrl)}>
      <video
        src={item.url}
        poster={item.posterUrl}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      <VideoBadge />
    </TileButton>
  );
}

function VideoBadge() {
  return (
    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
      <VideoIcon size={11} /> Video
    </span>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const previousMainOverflow = mainEl?.style.overflow;
    document.body.style.overflow = "hidden";
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (mainEl) mainEl.style.overflow = previousMainOverflow ?? "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo preview"
        className="absolute top-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white shadow-lg backdrop-blur-sm hover:bg-white/25 active:scale-95"
      >
        <XIcon size={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Post photo"
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] max-w-full touch-pan-y rounded-xl object-contain select-none"
      />
    </div>
  );
}

function VideoLightbox({ url, posterUrl, onClose }: { url: string; posterUrl?: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
    return () => {
      videoRef.current?.pause();
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const previousMainOverflow = mainEl?.style.overflow;
    document.body.style.overflow = "hidden";
    if (mainEl) mainEl.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (mainEl) mainEl.style.overflow = previousMainOverflow ?? "";
    };
  }, [onClose]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    if (e.target === videoRef.current) {
      togglePlay();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Video preview"
      onClick={onClose}
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        src={url}
        poster={posterUrl}
        playsInline
        className="max-h-[90vh] max-w-full rounded-xl object-contain select-none"
        onClick={handleVideoClick}
        onEnded={() => setPlaying(false)}
      />
      {showControls && (
        <>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video preview"
            className="absolute top-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white shadow-lg backdrop-blur-sm hover:bg-white/25 active:scale-95"
          >
            <XIcon size={22} />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              {playing ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              {muted ? <VolumeXIcon size={24} /> : <Volume2Icon size={24} />}
            </button>
            <button
              type="button"
              onClick={() => {
                videoRef.current?.requestFullscreen();
              }}
              aria-label="Fullscreen"
              className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              <ExpandIcon size={24} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function useVideoLightbox() {
  const [video, setVideo] = useState<{ url: string; posterUrl?: string } | null>(null);
  const open = (url: string, posterUrl?: string) => setVideo({ url, posterUrl });
  const close = () => setVideo(null);
  return { video, open, close, VideoLightbox: video ? (
    <VideoLightbox url={video.url} posterUrl={video.posterUrl} onClose={close} />
  ) : null };
}