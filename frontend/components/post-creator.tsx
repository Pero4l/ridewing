"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/avatar";
import { MediaPicker, type PickedMedia } from "@/components/media-upload";
import { Button } from "@/components/ui";
import type { Post } from "@/lib/types";

export function PostCreator({ onPosted }: { onPosted: (post: Post) => void }) {
  const { user } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function canPost() {
    return draft.trim().length > 0 || media.length > 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canPost() || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ post: Post }>("/api/posts", {
        content: draft.trim() || undefined,
        media: media.map((item) => ({ url: item.url, type: item.kind, width: item.width ?? undefined, height: item.height ?? undefined })),
      });
      setDraft("");
      setMedia([]);
      onPosted(res.post);
      toast.success("Posted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <Avatar name={user?.displayName ?? ""} username={user?.username ?? ""} image={user?.profileImage ?? null} size={38} />
        <div className="min-w-0 flex-1">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            rows={draft ? 3 : 2}
            placeholder="What's the word on the road?"
            className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <div className="mt-2">
            <MediaPicker value={media} onChange={setMedia} disabled={submitting} onError={(message) => toast.error(message)} />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="mr-auto text-xs tabular-nums text-zinc-400">{draft.length}/2000</span>
            <Button type="submit" size="sm" loading={submitting} disabled={!canPost()}>
              Post
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}