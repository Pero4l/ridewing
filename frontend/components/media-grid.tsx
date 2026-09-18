"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PostMedia } from "@/lib/types";
import { VideoIcon, XIcon } from "@/components/icons";

/**
 * Post media gallery.
 *
 * `preview` (default) renders a post's media the way Facebook/Instagram do:
 * a single item is full-bleed, two sit side by side, three grow the first into
 * a big tile, four form a 2x2 grid, and anything beyond four collapses to the
 * 2x2 grid with a "+N" tile that expands the rest in place.
 *
 * `preview={false}` renders a uniform 3-column grid (used by the profile gallery).
 * Videos and photos share the same grid so a post with one of each no longer
 * stacks vertically.
 */
export function MediaGrid({ media, preview = true }: { media: PostMedia[]; preview?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!media.length) return null;

  if (!preview) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {media.map((item) =>
          item.type === "video" ? <VideoTile key={item.url} item={item} compact /> : <ImageTile key={item.url} item={item} />,
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
          return item.type === "video" ? <VideoTile key={item.url} item={item} compact /> : <ImageTile key={item.url} item={item} />;
        })}
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-1.5">
          {media.map((item) =>
            item.type === "video" ? <VideoTile key={item.url} item={item} compact /> : <ImageTile key={item.url} item={item} />,
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
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
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
      {open && <Lightbox url={item.url} onClose={() => setOpen(false)} />}
    </>
  );
}

function VideoTile({ item, compact }: { item: PostMedia; compact: boolean }) {
  if (compact) {
    return (
      <div className="relative aspect-square overflow-hidden rounded-lg bg-black">
        <video
          src={item.url}
          controls
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <VideoBadge />
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
      <video src={item.url} controls playsInline preload="metadata" className="max-h-96 w-full" />
      <VideoBadge />
    </div>
  );
}

function VideoBadge() {
  return (
    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
      <VideoIcon size={11} /> Video
    </span>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
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