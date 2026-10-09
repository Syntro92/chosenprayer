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
import { communityService } from "@/lib/community/service";
import {
  DEMO_USER,
  SAMPLE_COMMENTS,
  SAMPLE_MEMBERS,
  SAMPLE_NOTIFICATIONS,
  SAMPLE_POSTS,
} from "@/lib/community/sample-data";
import type {
  Comment,
  DraftAttachment,
  Member,
  Notification,
  Post,
  ReportReason,
  Role,
} from "@/lib/community/types";
import { SignInPrompt } from "./dialogs";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface CommunityContextValue {
  /** DEMO: there is no auth system yet. Replace `role`/`user` with the real session. */
  role: Role;
  setRole: (r: Role) => void;
  user: Member | null;
  isModerator: boolean;

  posts: Post[];
  comments: Comment[];
  notifications: Notification[];
  getMember: (id: string) => Member | undefined;
  getMemberByUsername: (username: string) => Member | undefined;
  getPost: (id: string) => Post | undefined;

  likedPosts: Set<string>;
  likedComments: Set<string>;
  ageOf: (item: { ageMinutes: number; createdAt?: number }) => number;

  composerOpen: boolean;
  setComposerOpen: (o: boolean) => void;

  /** Returns true when signed in. Otherwise opens the prompt and remembers `then`. */
  requireAuth: (then?: () => void) => boolean;

  publishPost: (text: string, attachments: DraftAttachment[]) => Promise<boolean>;
  editPost: (id: string, text: string) => Promise<boolean>;
  removePost: (id: string, byModerator?: boolean) => Promise<boolean>;
  toggleLike: (id: string) => void;
  reportPost: (id: string, reason: ReportReason, note: string) => Promise<boolean>;

  addComment: (postId: string, text: string, parentId?: string) => Promise<boolean>;
  editComment: (id: string, text: string) => Promise<boolean>;
  removeComment: (id: string, byModerator?: boolean) => Promise<boolean>;
  toggleCommentLike: (id: string) => void;

  toast: (text: string, kind?: ToastKind) => void;
}

const Ctx = createContext<CommunityContextValue | null>(null);

export function useCommunity() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCommunity must be used inside <CommunityProvider>");
  return v;
}

const toggled = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("visitor");
  const [posts, setPosts] = useState<Post[]>(SAMPLE_POSTS);
  const [comments, setComments] = useState<Comment[]>(SAMPLE_COMMENTS);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [now, setNow] = useState(0);
  const pending = useRef<(() => void) | undefined>(undefined);
  const toastId = useRef(0);

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

  const user = role === "visitor" ? null : DEMO_USER;
  const isModerator = role === "moderator";

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

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    if (r === "visitor") {
      setComposerOpen(false);
    } else if (pending.current) {
      const run = pending.current;
      pending.current = undefined;
      setPromptOpen(false);
      setTimeout(run, 0);
    }
  }, []);

  const requireAuth = useCallback(
    (then?: () => void) => {
      if (role !== "visitor") return true;
      pending.current = then;
      setPromptOpen(true);
      return false;
    },
    [role],
  );

  const guard = useCallback(
    (fn: () => Promise<boolean>, errorText: string) =>
      fn().catch(() => {
        toast(errorText, "error");
        return false;
      }),
    [toast],
  );

  const publishPost = useCallback(
    (text: string, attachments: DraftAttachment[]) =>
      guard(async () => {
        if (!user) return false;
        const post = await communityService.createPost({ authorId: user.id, text, attachments });
        setPosts((p) => [post, ...p]);
        toast("Post published (demo: not saved anywhere)");
        return true;
      }, "Couldn't publish your post. Please try again."),
    [guard, toast, user],
  );

  const editPost = useCallback(
    (id: string, text: string) =>
      guard(async () => {
        const res = await communityService.updatePost(id, text);
        setPosts((p) => p.map((x) => (x.id === id ? { ...x, text: res.text, edited: true } : x)));
        toast("Post updated");
        return true;
      }, "Couldn't update the post."),
    [guard, toast],
  );

  const removePost = useCallback(
    (id: string, byModerator = false) =>
      guard(async () => {
        await communityService.deletePost(id);
        setPosts((p) => p.filter((x) => x.id !== id));
        setComments((c) => c.filter((x) => x.postId !== id));
        toast(byModerator ? "Post removed by moderator" : "Post deleted");
        return true;
      }, "Couldn't delete the post."),
    [guard, toast],
  );

  const toggleLike = useCallback(
    (id: string) => {
      if (!requireAuth(() => setLikedPosts((s) => (s.has(id) ? s : toggled(s, id))))) return;
      setLikedPosts((s) => toggled(s, id));
    },
    [requireAuth],
  );

  const reportPost = useCallback(
    (id: string, reason: ReportReason, note: string) =>
      guard(async () => {
        await communityService.report(id, reason, note);
        toast("Report submitted. Thank you for looking out for the community.");
        return true;
      }, "Couldn't submit your report."),
    [guard, toast],
  );

  const addComment = useCallback(
    (postId: string, text: string, parentId?: string) =>
      guard(async () => {
        if (!user) return false;
        const c = await communityService.addComment({ postId, authorId: user.id, text, parentId });
        setComments((all) => [...all, c]);
        toast(parentId ? "Reply added" : "Comment added");
        return true;
      }, "Couldn't send your comment. Please try again."),
    [guard, toast, user],
  );

  const editComment = useCallback(
    (id: string, text: string) =>
      guard(async () => {
        const res = await communityService.updateComment(id, text);
        setComments((all) => all.map((c) => (c.id === id ? { ...c, text: res.text, edited: true } : c)));
        toast("Comment updated");
        return true;
      }, "Couldn't update the comment."),
    [guard, toast],
  );

  const removeComment = useCallback(
    (id: string, byModerator = false) =>
      guard(async () => {
        await communityService.deleteComment(id);
        setComments((all) => all.filter((c) => c.id !== id && c.parentId !== id));
        toast(byModerator ? "Comment removed by moderator" : "Comment deleted");
        return true;
      }, "Couldn't delete the comment."),
    [guard, toast],
  );

  const toggleCommentLike = useCallback(
    (id: string) => {
      if (!requireAuth()) return;
      setLikedComments((s) => toggled(s, id));
    },
    [requireAuth],
  );

  const value = useMemo<CommunityContextValue>(
    () => ({
      role,
      setRole,
      user,
      isModerator,
      posts,
      comments,
      notifications: SAMPLE_NOTIFICATIONS,
      getMember: (id) => SAMPLE_MEMBERS.find((m) => m.id === id),
      getMemberByUsername: (u) => SAMPLE_MEMBERS.find((m) => m.username === u),
      getPost: (id) => posts.find((p) => p.id === id),
      likedPosts,
      likedComments,
      ageOf,
      composerOpen,
      setComposerOpen,
      requireAuth,
      publishPost,
      editPost,
      removePost,
      toggleLike,
      reportPost,
      addComment,
      editComment,
      removeComment,
      toggleCommentLike,
      toast,
    }),
    [
      role, setRole, user, isModerator, posts, comments, likedPosts, likedComments,
      ageOf, composerOpen, requireAuth, publishPost, editPost, removePost, toggleLike,
      reportPost, addComment, editComment, removeComment, toggleCommentLike, toast,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <SignInPrompt
        open={promptOpen}
        onClose={() => {
          pending.current = undefined;
          setPromptOpen(false);
        }}
        onDemoMember={() => setRole("member")}
      />
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
