/**
 * Community service layer (MOCK).
 *
 * Every function here is the seam where a real API call goes later. The UI
 * only talks to this module, so swapping in `fetch("/api/community/...")` does
 * not require touching components.
 *
 * Nothing here persists anything. Results are not "saved" until a real backend
 * confirms them. A real backend must also validate file type/size, enforce
 * permissions, and store files securely.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- mock: params are the future API contract */
import { uid } from "./format";
import type { Attachment, Comment, DraftAttachment, Post, ReportReason } from "./types";

const delay = (ms = 450) => new Promise<void>((r) => setTimeout(r, ms));

export const communityService = {
  async createPost(input: { authorId: string; text: string; attachments: DraftAttachment[] }): Promise<Post> {
    await delay(600);
    // Real version: upload files (multipart / pre-signed URLs), then create the post.
    const attachments: Attachment[] = input.attachments.map(({ file: _file, ...a }) => {
      void _file;
      return { ...a, href: a.href ?? a.src };
    });
    return {
      id: uid("post"),
      authorId: input.authorId,
      text: input.text,
      attachments,
      ageMinutes: 0,
      createdAt: Date.now(),
      baseLikes: 0,
    };
  },

  async updatePost(_id: string, text: string): Promise<{ text: string }> {
    await delay();
    return { text };
  },

  async deletePost(_id: string): Promise<void> {
    await delay();
  },

  async addComment(input: { postId: string; authorId: string; text: string; parentId?: string }): Promise<Comment> {
    await delay();
    return {
      id: uid("comment"),
      postId: input.postId,
      authorId: input.authorId,
      text: input.text,
      parentId: input.parentId,
      ageMinutes: 0,
      createdAt: Date.now(),
      baseLikes: 0,
    };
  },

  async updateComment(_id: string, text: string): Promise<{ text: string }> {
    await delay();
    return { text };
  },

  async deleteComment(_id: string): Promise<void> {
    await delay();
  },

  async report(_postId: string, _reason: ReportReason, _note: string): Promise<void> {
    await delay(500);
  },
};
