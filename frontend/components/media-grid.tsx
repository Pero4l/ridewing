"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { PostMedia } from "@/lib/types";
import { VideoIcon, XIcon, Volume2Icon, VolumeXIcon, ExpandIcon } from "@/components/icons";

type MediaGridProps = {
  media: PostMedia[];
  /**
   * `false` renders the square profile-gallery layout instead of the in-post
   * layout. The difference is only presentation — a grid still has to know where
   * a tile came from, which is what `linkTo` is for.
   */
  preview?: boolean;
  /**
   * Where a tile navigates to when tapped, keyed by media item. Used by the
   * profile gallery, where tiles are stripped of everything but their media, so
   * without this a video tile is inert and a photo opens a lightbox with no way
   * to the caption, likes or comments it belongs to.
   */
  linkTo?: (item: PostMedia) => string | undefined;
  onVideoClick?: (url: string, posterUrl?: string) => void;
};

export function MediaGrid({ media, preview = true, linkTo, onVideoClick }: MediaGridProps) {
  const [expanded, setExpanded] = useState(false);

  if (!media.length) return null;

  const render = (item: PostMedia, key: string, compact: boolean) =>
    linkTo ? (
      <LinkedTile key={key} href={linkTo(item)}>
        {item.type === "video" ? <VideoTileBody item={item} /> : <MediaThumb item={item} />}
      </LinkedTile>
    ) : item.type === "video" ? (
      <VideoTile key={key} item={item} compact={compact} onVideoClick={onVideoClick} />
    ) : (
      <ImageTile key={key} item={item} />
    );

  if (!preview) {
    return <div className="grid grid-cols-3 gap-1.5">{media.map((item, i) => render(item, `${item.url}-${i}`, true))}</div>;
  }

  if (media.length <= 4) {
    const count = media.length;
    const columns =
      count === 1 ? "grid-cols-1" : count === 3 ? "grid-cols-2 [&>*:first-child]:col-span-2 [&>*:first-child]:row-span-2" : "grid-cols-2";
    return <div className={`grid gap-1.5 ${columns}`}>{media.map((item, i) => render(item, `${item.url}-${i}`, count > 1))}</div>;
  }

  const overflowCount = media.length - 4;
  const previewItems = media.slice(0, 4);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {previewItems.map((item, index) => {
          const key = `${item.url}-${index}`;
          if (index === 3) {
            return (
              <TileButton key={key} onOpen={() => setExpanded((value) => !value)}>
                <MediaThumb item={item} />
                <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-[2px]">
                  <span className="text-3xl font-bold text-white">+{overflowCount}</span>
                </div>
              </TileButton>
            );
          }
          return render(item, key, true);
        })}
      </div>
      {expanded && <div className="grid grid-cols-2 gap-1.5">{media.map((item, i) => render(item, `${item.url}-${i}`, true))}</div>}
    </div>
  );
}

/** A grid tile that opens the post the media came from. */
function LinkedTile({ href, children }: { href: string | undefined; children: ReactNode }) {
  const body = (
    <span className="block relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">{children}</span>
  );
  if (!href) return body;
  return (
    <Link href={href} className="group block">
      {body}
    </Link>
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
        <VideoTileBody item={item} />
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

/**
 * The video tile as a plain element, for the grid where the tap navigates rather
 * than opening the player: an interactive `<video>` inside a link would swallow
 * the navigation on some browsers.
 */
function VideoTileBody({ item }: { item: PostMedia }) {
  return (
    <>
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
    </>
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
    // Capture the node now. Reading `videoRef.current` in the cleanup would read
    // whatever the ref points at *by unmount time* — which React may already
    // have detached — so the pause would silently do nothing and playback could
    // outlive the lightbox.
    const video = videoRef.current;
    video?.play().catch(() => {});
    return () => {
      video?.pause();
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