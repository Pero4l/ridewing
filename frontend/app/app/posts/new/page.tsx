"use client";

import { useRouter } from "next/navigation";
import { PostCreator } from "@/components/post-creator";
import { PageHeader } from "@/components/ui";
import { BackIcon } from "@/components/icons";

export default function NewPostPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader>
        <button
          type="button"
          onClick={() => router.back()}
          className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Back"
        >
          <BackIcon size={18} />
        </button>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">New post</h1>
      </PageHeader>
      <PostCreator
        onPosted={() => {
          router.replace("/app");
          router.refresh();
        }}
      />
    </div>
  );
}