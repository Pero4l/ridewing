"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import { MediaPicker, type PickedMedia } from "@/components/media-upload";
import { Textarea, Button } from "@/components/ui";
import { XIcon } from "@/components/icons";
import type { Post } from "@/lib/types";

function toPicked(media: Post["media"]): PickedMedia[] {
  return media.map((item) => ({
    mediaId: item.url,
    kind: item.type,
    url: item.url,
    width: item.width ?? null,
    height: item.height ?? null,
  }));
}

export function PostEditDialog({
  post,
  onClose,
  onSaved,
}: {
  post: Post;
  onClose: () => void;
  onSaved: (post: Post) => void;
}) {
  const toast = useToast();
  const [content, setContent] = useState(post.content);
  const [media, setMedia] = useState<PickedMedia[]>(() => toPicked(post.media));
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const mediaEditable = now < new Date(post.mediaEditableUntil).getTime();

  function canSave() {
    return content.trim().length > 0 || media.length > 0;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave() || saving) return;
    setSaving(true);
    try {
      const res = await api.patch<{ post: Post }>(`/api/posts/${post.id}`, {
        content: content.trim() || undefined,
        media: media.map((item) => ({ url: item.url, type: item.kind, width: item.width ?? undefined, height: item.height ?? undefined })),
      });
      onSaved(res.post);
      toast.success("Post updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update post");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Edit post">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default" />
      <form
        onSubmit={save}
        className="relative w-full max-w-lg rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl sm:rounded-3xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Edit post</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <XIcon size={16} />
          </button>
        </div>

        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="What's the word on the road?"
          className="min-h-28"
        />

        <div className="mt-3">
          <MediaPicker
            value={media}
            onChange={setMedia}
            disabled={saving || !mediaEditable}
            onError={(message) => toast.error(message)}
          />
          {!mediaEditable && (
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Photos and videos are locked after 10 minutes. You can still edit the text.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs tabular-nums text-zinc-400">{content.length}/2000</span>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving} disabled={!canSave()}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}