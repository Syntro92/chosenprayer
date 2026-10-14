"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@supabase/supabase-js";
import {
  addCommentAction,
  createPostAction,
  deleteCommentAction,
  deletePostAction,
  editCommentAction,
  editPostAction,
  loadCommentsAction,
  loadFeedAction,
  loadNotificationsAction,
  markNotificationsReadAction,
  reportCommentAction,
  reportPostAction,
  requestUploadUrlsAction,
  setCommentLikeAction,
  setPostLikeAction,
} from "@/actions/community";
import { ATTACHMENT_BUCKET, MIME_BY_EXT, extOf } from "@/lib/community/config";
import type {
  Comment,
  CommentDTO,
  DraftAttachment,
  FeedPage,
  Member,
  Notification,
  NotificationsPage,
  Post,
  PostDTO,
  ReportReason,
} from "@/lib/community/types";
import type { FeedQueryInput } from "@/lib/schemas/community";
import type { Result } from "@/server/errors";
import { pinPostAction, removeCommentAsModeratorAction, removePostAsModeratorAction, suspendUserAction } from "@/actions/moderation";
import { SignInPrompt } from "./dialogs";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

export type FeedStatus = "idle" | "loading" | "error";

/** Data the server already fetched for this page, so the first paint needs no extra requests. */
export interface CommunityInitial {
  posts?: PostDTO[];
  comments?: CommentDTO[];
  /** Posts whose comments are already in `comments` (so they aren't fetched again). */
  commentsLoadedFor?: string[];
  members?: Member[];
  nextCursor?: string | null;
  notifications?: NotificationsPage;
}

export interface CommunitySession {
  /** The signed-in member. Community pages are members-only, so this is always set in practice. */
  user: Member | null;
  /** True for moderators and admins: unlocks removal tools and the report queue. */
  isModerator: boolean;
  /** True for admins only: unlocks pinning posts and blocking members. */
  isAdmin?: boolean;
  /** Open reports waiting for a moderator (only provided to moderators). */
  openReports?: number;
}

interface CommunityContextValue {
  user: Member | null;
  isModerator: boolean;
  isAdmin: boolean;
  openReports: number | null;

  posts: Post[];
  comments: Comment[];
  notifications: Notification[];
  unreadNotifications: number;
  getMember: (id: string) => Member | undefined;
  getMemberByUsername: (username: string) => Member | undefined;
  getPost: (id: string) => Post | undefined;

  likedPosts: Set<string>;
  likedComments: Set<string>;
  ageOf: (item: { ageMinutes: number; createdAt?: number }) => number;

  feed: { status: FeedStatus; hasMore: boolean; query: FeedQueryInput };
  loadFeed: (query: FeedQueryInput) => Promise<void>;
  loadMoreFeed: () => Promise<void>;
  /** Merge server-provided posts (e.g. from a member's profile) into the store. */
  ingest: (page: Pick<FeedPage, "posts" | "members">) => void;
  ensureComments: (postId: string) => Promise<void>;

  composerOpen: boolean;
  setComposerOpen: (o: boolean) => void;

  /** Returns true when signed in. Otherwise opens the sign-in prompt. */
  requireAuth: () => boolean;

  publishPost: (text: string, attachments: DraftAttachment[]) => Promise<boolean>;
  editPost: (id: string, text: string) => Promise<boolean>;
  /** `reason` is required when a moderator removes someone else's post. */
  removePost: (id: string, byModerator?: boolean, reason?: string) => Promise<boolean>;
  /** Admin only. Pinned posts stay at the top of the main feed. */
  pinPost: (id: string, pinned: boolean) => Promise<boolean>;
  /** Admin only. Blocks (suspends) the member: signed out, can't sign in or post. */
  blockMember: (userId: string, reason: string) => Promise<boolean>;
  toggleLike: (id: string) => void;
  reportPost: (id: string, reason: ReportReason, note: string) => Promise<boolean>;
  reportComment: (id: string, reason: ReportReason, note: string) => Promise<boolean>;

  addComment: (postId: string, text: string, parentId?: string) => Promise<boolean>;
  editComment: (id: string, text: string) => Promise<boolean>;
  removeComment: (id: string, byModerator?: boolean, reason?: string) => Promise<boolean>;
  toggleCommentLike: (id: string) => void;

  refreshNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;

  toast: (text: string, kind?: ToastKind) => void;
}

const Ctx = createContext<CommunityContextValue | null>(null);

export function useCommunity() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCommunity must be used inside <CommunityProvider>");
  return v;
}

const DEFAULT_QUERY: FeedQueryInput = { tab: "feed", filter: "latest" };

/** DTO -> store shape (the "liked by me" flag lives in a Set, not on the item). */
const stripPost = ({ likedByMe, ...p }: PostDTO): Post => (void likedByMe, p);
const stripComment = ({ likedByMe, ...c }: CommentDTO): Comment => (void likedByMe, c);

const withToggled = (set: Set<string>, id: string, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
};

export function CommunityProvider({
  session,
  initial = {},
  children,
}: {
  session: CommunitySession;
  initial?: CommunityInitial;
  children: ReactNode;
}) {
  const { user, isModerator, isAdmin = false, openReports = null } = session;

  const [posts, setPosts] = useState<Post[]>(() => (initial.posts ?? []).map(stripPost));
  const [comments, setComments] = useState<Comment[]>(() => (initial.comments ?? []).map(stripComment));
  const [members, setMembers] = useState<Record<string, Member>>(() => {
    const all = [...(initial.members ?? []), ...(user ? [user] : [])];
    return Object.fromEntries(all.map((m) => [m.id, m]));
  });
  const [likedPosts, setLikedPosts] = useState<Set<string>>(
    () => new Set((initial.posts ?? []).filter((p) => p.likedByMe).map((p) => p.id)),
  );
  const [likedComments, setLikedComments] = useState<Set<string>>(
    () => new Set((initial.comments ?? []).filter((c) => c.likedByMe).map((c) => c.id)),
  );
  const [notifications, setNotifications] = useState<Notification[]>(initial.notifications?.items ?? []);
  const [unread, setUnread] = useState(initial.notifications?.unread ?? 0);
  const [feedState, setFeedState] = useState<{ status: FeedStatus; cursor: string | null; query: FeedQueryInput }>({
    status: "idle",
    cursor: initial.nextCursor ?? null,
    query: DEFAULT_QUERY,
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [now, setNow] = useState(0);

  const toastId = useRef(0);
  const feedSeq = useRef(0); // ignore responses from superseded feed requests
  const commentsLoaded = useRef(new Set(initial.commentsLoadedFor ?? []));
  const commentsLoading = useRef(new Set<string>());

  // Tick on the client only, so server and client markup match on first render.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const ageOf = useCallback(
    (item: { ageMinutes: number; createdAt?: number }) =>
      item.ageMinutes + (item.createdAt && now ? Math.max(0, (now - item.createdAt) / 60000) : 0),
    [now],
  );

  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const requireAuth = useCallback(() => {
    if (user) return true;
    setPromptOpen(true);
    return false;
  }, [user]);

  /** Unwraps an action result; shows the server's (user-safe) message when it fails. */
  const unwrap = useCallback(
    <T,>(r: Result<T>, fallback: string): T | null => {
      if (r.ok) return r.data;
      toast(r.error.code === "INTERNAL" ? fallback : r.error.message, "error");
      return null;
    },
    [toast],
  );

  const mergeMembers = useCallback((list: Member[]) => {
    if (list.length === 0) return;
    setMembers((cur) => ({ ...cur, ...Object.fromEntries(list.map((m) => [m.id, m])) }));
  }, []);

  /* ------------------------------ feed ------------------------------ */

  const applyPage = useCallback(
    (page: FeedPage, mode: "replace" | "append") => {
      mergeMembers(page.members);
      setPosts((cur) => {
        if (mode === "replace") return page.posts.map(stripPost);
        const seen = new Set(cur.map((p) => p.id));
        return [...cur, ...page.posts.filter((p) => !seen.has(p.id)).map(stripPost)];
      });
      setLikedPosts((cur) => {
        const next = mode === "replace" ? new Set<string>() : new Set(cur);
        for (const p of page.posts) if (p.likedByMe) next.add(p.id);
        return next;
      });
    },
    [mergeMembers],
  );

  const loadFeed = useCallback(
    async (query: FeedQueryInput) => {
      const seq = ++feedSeq.current;
      setFeedState((s) => ({ ...s, status: "loading", query }));
      const r = await loadFeedAction(query);
      if (seq !== feedSeq.current) return; // a newer request superseded this one
      if (!r.ok) {
        setFeedState((s) => ({ ...s, status: "error" }));
        return;
      }
      applyPage(r.data, "replace");
      setFeedState({ status: "idle", cursor: r.data.nextCursor, query });
    },
    [applyPage],
  );

  const loadMoreFeed = useCallback(async () => {
    if (!feedState.cursor || feedState.status === "loading") return;
    const seq = ++feedSeq.current;
    const query = feedState.query;
    setFeedState((s) => ({ ...s, status: "loading" }));
    const r = await loadFeedAction({ ...query, cursor: feedState.cursor });
    if (seq !== feedSeq.current) return;
    if (!r.ok) {
      setFeedState((s) => ({ ...s, status: "error" }));
      return;
    }
    applyPage(r.data, "append");
    setFeedState({ status: "idle", cursor: r.data.nextCursor, query });
  }, [feedState, applyPage]);

  const ingest = useCallback(
    (page: Pick<FeedPage, "posts" | "members">) => applyPage({ ...page, nextCursor: null }, "append"),
    [applyPage],
  );

  /* ----------------------------- comments ---------------------------- */

  const ensureComments = useCallback(
    async (postId: string) => {
      if (commentsLoaded.current.has(postId) || commentsLoading.current.has(postId)) return;
      commentsLoading.current.add(postId);
      const r = await loadCommentsAction(postId);
      commentsLoading.current.delete(postId);
      if (!r.ok) return; // the panel simply shows no comments; opening it again retries
      commentsLoaded.current.add(postId);
      mergeMembers(r.data.members);
      setComments((cur) => [...cur.filter((c) => c.postId !== postId), ...r.data.comments.map(stripComment)]);
      setLikedComments((cur) => {
        const next = new Set(cur);
        for (const c of r.data.comments) if (c.likedByMe) next.add(c.id);
        return next;
      });
    },
    [mergeMembers],
  );

  /* ----------------------------- posting ----------------------------- */

  const publishPost = useCallback(
    async (text: string, drafts: DraftAttachment[]) => {
      if (!user) return false;
      try {
        let attachments: { key: string; name: string }[] = [];
        if (drafts.length > 0) {
          // 1) ask for one-time upload permissions, 2) send the files straight to storage.
          const up = unwrap(await requestUploadUrlsAction({ files: drafts.map((d) => ({ name: d.name, size: d.size })) }), "Couldn't prepare your upload.");
          if (!up) return false;
          const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          }).storage.from(ATTACHMENT_BUCKET);
          for (const [i, target] of up.entries()) {
            const d = drafts[i];
            const { error } = await storage.uploadToSignedUrl(target.key, target.token, d.file, {
              contentType: MIME_BY_EXT[extOf(d.name)],
            });
            if (error) {
              toast(`Couldn't upload "${d.name}". Please try again.`, "error");
              return false;
            }
          }
          attachments = up.map((t) => ({ key: t.key, name: t.name }));
        }
        const created = unwrap(await createPostAction({ text, attachments }), "Couldn't publish your post. Please try again.");
        if (!created) return false;
        mergeMembers(created.members);
        setPosts((p) => [{ ...stripPost(created.post), createdAt: Date.now() }, ...p]);
        toast("Post published");
        return true;
      } catch {
        toast("Couldn't publish your post. Please try again.", "error");
        return false;
      }
    },
    [user, unwrap, toast, mergeMembers],
  );

  const editPost = useCallback(
    async (id: string, text: string) => {
      const res = unwrap(await editPostAction(id, { text }), "Couldn't update the post.");
      if (!res) return false;
      setPosts((p) => p.map((x) => (x.id === id ? { ...x, text: res.text, edited: true } : x)));
      toast("Post updated");
      return true;
    },
    [unwrap, toast],
  );

  const removePost = useCallback(
    async (id: string, byModerator = false, reason = "") => {
      const r = byModerator ? await removePostAsModeratorAction(id, { reason }) : await deletePostAction(id);
      if (!r.ok) {
        unwrap(r, byModerator ? "Couldn't remove the post." : "Couldn't delete the post.");
        return false;
      }
      setPosts((p) => p.filter((x) => x.id !== id));
      setComments((c) => c.filter((x) => x.postId !== id));
      toast(byModerator ? "Post removed. The author has been told why." : "Post deleted");
      return true;
    },
    [unwrap, toast],
  );

  const pinPost = useCallback(
    async (id: string, pinned: boolean) => {
      const r = await pinPostAction(id, { pinned });
      if (!r.ok) {
        unwrap(r, pinned ? "Couldn't pin the post." : "Couldn't unpin the post.");
        return false;
      }
      setPosts((cur) => {
        const next = cur.map((x) => (x.id === id ? { ...x, pinned: pinned || undefined } : x));
        // Pinned posts lead the plain "everyone, latest" feed; other views keep their own order.
        const q = feedState.query;
        if (!pinned || q.tab !== "feed" || q.filter !== "latest" || q.q) return next;
        return [...next.filter((x) => x.pinned), ...next.filter((x) => !x.pinned)];
      });
      toast(pinned ? "Post pinned to the top of the feed" : "Post unpinned");
      return true;
    },
    [unwrap, toast, feedState.query],
  );

  const blockMember = useCallback(
    async (userId: string, reason: string) => {
      const r = await suspendUserAction(userId, { reason });
      if (!r.ok) {
        unwrap(r, "Couldn't block that member.");
        return false;
      }
      toast("Member blocked. They are signed out and can't sign in or post.");
      return true;
    },
    [unwrap, toast],
  );

  const toggleLike = useCallback(
    (id: string) => {
      if (!requireAuth()) return;
      const next = !likedPosts.has(id);
      setLikedPosts((s) => withToggled(s, id, next)); // optimistic
      void setPostLikeAction(id, next).then((r) => {
        if (!r.ok) {
          setLikedPosts((s) => withToggled(s, id, !next)); // roll back
          unwrap(r, "Couldn't update your appreciation.");
          return;
        }
        // Sync with everyone else's likes so the number can't drift.
        setPosts((p) => p.map((x) => (x.id === id ? { ...x, baseLikes: r.data.likeCount - (r.data.liked ? 1 : 0) } : x)));
      });
    },
    [requireAuth, likedPosts, unwrap],
  );

  const submitReport = useCallback(
    async (run: () => Promise<Result<void>>, what: "post" | "comment") => {
      const r = await run();
      if (r.ok) {
        toast("Report submitted. Thank you for looking out for the community.");
        return true;
      }
      if (r.error.code === "CONFLICT") {
        toast(r.error.message, "info"); // already reported: nothing more to do
        return true;
      }
      unwrap(r, `Couldn't submit your report on that ${what}.`);
      return false;
    },
    [toast, unwrap],
  );

  const reportPost = useCallback(
    (id: string, reason: ReportReason, note: string) => submitReport(() => reportPostAction(id, { reason, note }), "post"),
    [submitReport],
  );
  const reportComment = useCallback(
    (id: string, reason: ReportReason, note: string) => submitReport(() => reportCommentAction(id, { reason, note }), "comment"),
    [submitReport],
  );

  /* ---------------------------- commenting --------------------------- */

  const bumpCommentCount = useCallback((postId: string, by: number) => {
    setPosts((p) => p.map((x) => (x.id === postId ? { ...x, commentCount: Math.max(0, x.commentCount + by) } : x)));
  }, []);

  const addComment = useCallback(
    async (postId: string, text: string, parentId?: string) => {
      const res = unwrap(await addCommentAction({ postId, text, parentId }), "Couldn't send your comment. Please try again.");
      if (!res) return false;
      mergeMembers(res.members);
      setComments((all) => [...all, { ...stripComment(res.comment), createdAt: Date.now() }]);
      bumpCommentCount(postId, 1);
      toast(parentId ? "Reply added" : "Comment added");
      return true;
    },
    [unwrap, toast, mergeMembers, bumpCommentCount],
  );

  const editComment = useCallback(
    async (id: string, text: string) => {
      const res = unwrap(await editCommentAction(id, { text }), "Couldn't update the comment.");
      if (!res) return false;
      setComments((all) => all.map((c) => (c.id === id ? { ...c, text: res.text, edited: true } : c)));
      toast("Comment updated");
      return true;
    },
    [unwrap, toast],
  );

  const removeComment = useCallback(
    async (id: string, byModerator = false, reason = "") => {
      const r = byModerator ? await removeCommentAsModeratorAction(id, { reason }) : await deleteCommentAction(id);
      if (!r.ok) {
        unwrap(r, byModerator ? "Couldn't remove the comment." : "Couldn't delete the comment.");
        return false;
      }
      const target = comments.find((c) => c.id === id);
      const gone = comments.filter((c) => c.id === id || c.parentId === id).length;
      setComments((all) => all.filter((c) => c.id !== id && c.parentId !== id));
      if (target) bumpCommentCount(target.postId, -gone);
      toast(byModerator ? "Comment removed. The author has been told why." : "Comment deleted");
      return true;
    },
    [comments, unwrap, toast, bumpCommentCount],
  );

  const toggleCommentLike = useCallback(
    (id: string) => {
      if (!requireAuth()) return;
      const next = !likedComments.has(id);
      setLikedComments((s) => withToggled(s, id, next));
      void setCommentLikeAction(id, next).then((r) => {
        if (!r.ok) {
          setLikedComments((s) => withToggled(s, id, !next));
          unwrap(r, "Couldn't update your appreciation.");
          return;
        }
        setComments((all) => all.map((c) => (c.id === id ? { ...c, baseLikes: r.data.likeCount - (r.data.liked ? 1 : 0) } : c)));
      });
    },
    [requireAuth, likedComments, unwrap],
  );

  /* -------------------------- notifications -------------------------- */

  const refreshNotifications = useCallback(async () => {
    const r = await loadNotificationsAction();
    if (!r.ok) return;
    setNotifications(r.data.items);
    setUnread(r.data.unread);
  }, []);

  const markNotificationsRead = useCallback(async () => {
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    setUnread(0);
    await markNotificationsReadAction("all");
  }, []);

  /* ------------------------------ value ------------------------------ */

  const value = useMemo<CommunityContextValue>(
    () => ({
      user,
      isModerator,
      isAdmin,
      openReports,
      posts,
      comments,
      notifications,
      unreadNotifications: unread,
      getMember: (id) => members[id],
      getMemberByUsername: (u) => Object.values(members).find((m) => m.username === u),
      getPost: (id) => posts.find((p) => p.id === id),
      likedPosts,
      likedComments,
      ageOf,
      feed: { status: feedState.status, hasMore: feedState.cursor !== null, query: feedState.query },
      loadFeed,
      loadMoreFeed,
      ingest,
      ensureComments,
      composerOpen,
      setComposerOpen,
      requireAuth,
      publishPost,
      editPost,
      removePost,
      pinPost,
      blockMember,
      toggleLike,
      reportPost,
      reportComment,
      addComment,
      editComment,
      removeComment,
      toggleCommentLike,
      refreshNotifications,
      markNotificationsRead,
      toast,
    }),
    [
      user, isModerator, isAdmin, openReports, posts, comments, notifications, unread, members, likedPosts, likedComments, ageOf,
      feedState, loadFeed, loadMoreFeed, ingest, ensureComments, composerOpen, requireAuth, publishPost,
      editPost, removePost, pinPost, blockMember, toggleLike, reportPost, reportComment, addComment, editComment, removeComment,
      toggleCommentLike, refreshNotifications, markNotificationsRead, toast,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <SignInPrompt open={promptOpen} onClose={() => setPromptOpen(false)} />
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
              t.kind === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-line bg-charcoal-deep text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
