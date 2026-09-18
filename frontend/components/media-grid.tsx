"use client";

import { useEffect, useState } from "react";
import type { PostMedia } from "@/lib/types";
import { VideoIcon, XIcon } from "@/components/icons";

export function MediaGrid({ media }: { media: PostMedia[] }) {
  const images = media.filter((item) => item.type === "image");
  const video = media.find((item) => item.type === "video");

  return (
    <div className="space-y-2">
      {video && <VideoTile item={video} />}
      {images.length > 0 && (
        <div className={`grid gap-1.5 ${images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {images.map((item) => (
            <ImageTile key={item.url} item={item} spanCount={images.length} />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageTile({ item, spanCount }: { item: PostMedia; spanCount: number }) {
  const [open, setOpen] = useState(false);
  const span = spanCount === 4 || spanCount > 5 ? "col-span-2 row-span-2" : "";
  const firstBig = spanCount === 4 || spanCount === 7 || spanCount === 8 ? "first:col-span-2 first:row-span-2" : "";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative aspect-square touch-pan-y overflow-hidden rounded-lg bg-zinc-100 select-none dark:bg-zinc-800 ${span} ${firstBig}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt="Post photo"
          loading="lazy"
          draggable={false}
          className="h-full w-full touch-pan-y object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </button>
      {open && <Lightbox url={item.url} onClose={() => setOpen(false)} />}
    </>
  );
}

function VideoTile({ item }: { item: PostMedia }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
      <video
        src={item.url}
        controls
        playsInline
        preload="metadata"
        className="max-h-96 w-full"
      />
      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
        <VideoIcon size={11} /> Video
      </span>
    </div>
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