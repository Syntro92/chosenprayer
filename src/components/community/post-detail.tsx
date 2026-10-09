"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import { useCommunity } from "./community-provider";
import { PostCard } from "./post-card";
import { EmptyState, focus, primaryBtn, secondaryBtn } from "./ui";

export function PostDetail({ postId }: { postId: string }) {
  const { getPost, toast } = useCommunity();
  const post = getPost(postId);
  // Origin is only known in the browser; the server snapshot is empty so markup matches.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = `${origin}/community/posts/${postId}`;

  return (
    <main className="bg-ivory">
      <div className="mx-auto w-full max-w-[720px] space-y-4 px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
        <Link href="/community" className={`inline-flex items-center gap-2 rounded text-sm font-medium text-slate hover:text-charcoal-deep ${focus}`}>
          <ArrowLeft size={16} aria-hidden /> Back to community
        </Link>
        {post ? (
          <>
            <h1 className="sr-only">Community post</h1>
            <PostCard post={post} detail />
            <div className="rounded-2xl border border-line bg-white p-4">
              <label htmlFor="share-url" className="text-sm font-medium">Link to this post</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="share-url"
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`h-10 min-w-0 flex-1 rounded-xl border border-line bg-ivory px-3 text-sm ${focus}`}
                />
                <button
                  type="button"
                  className={`${secondaryBtn} h-10`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      toast("Link copied to clipboard", "info");
                    } catch {
                      toast("Couldn't copy. Select the link and copy it manually.", "error");
                    }
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="This post isn't available"
            text="It may have been removed, or it only existed in a previous demo session (demo posts aren't saved)."
            action={<Link href="/community" className={primaryBtn}>Back to community</Link>}
          />
        )}
      </div>
    </main>
  );
}
