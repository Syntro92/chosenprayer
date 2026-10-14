"use server";

import type { FeedQueryInput } from "@/lib/schemas/community";
import { action } from "@/server/action";
import { getActor } from "@/server/auth/session";
import * as attachments from "@/server/services/attachments";
import * as comments from "@/server/services/comments";
import * as notifications from "@/server/services/notifications";
import * as posts from "@/server/services/posts";
import * as reports from "@/server/services/reports";

// Every function here is a thin adapter: identify the caller, hand the (untrusted)
// input to a service, return `{ ok, data } | { ok: false, error }`. All rules live in
// src/server/services/*, which validate and authorize again.

export async function loadFeedAction(query: FeedQueryInput) {
  return action("loadFeed", async () => posts.listFeed(await getActor(), query));
}

export async function loadMemberPostsAction(username: string, page: unknown) {
  return action("loadMemberPosts", async () => posts.listMemberPosts(await getActor(), username, page));
}

export async function createPostAction(input: unknown) {
  return action("createPost", async () => posts.createPost(await getActor(), input));
}

export async function editPostAction(id: string, input: unknown) {
  return action("editPost", async () => posts.editPost(await getActor(), id, input));
}

export async function deletePostAction(id: string) {
  return action("deletePost", async () => posts.deletePost(await getActor(), id));
}

export async function setPostLikeAction(id: string, liked: boolean) {
  return action("setPostLike", async () => posts.setPostLike(await getActor(), id, liked === true));
}

export async function requestUploadUrlsAction(input: unknown) {
  return action("requestUploadUrls", async () => attachments.requestUploadUrls(await getActor(), input));
}

export async function loadCommentsAction(postId: string) {
  return action("loadComments", async () => comments.listComments(await getActor(), postId));
}

export async function addCommentAction(input: unknown) {
  return action("addComment", async () => comments.addComment(await getActor(), input));
}

export async function editCommentAction(id: string, input: unknown) {
  return action("editComment", async () => comments.editComment(await getActor(), id, input));
}

export async function deleteCommentAction(id: string) {
  return action("deleteComment", async () => comments.deleteComment(await getActor(), id));
}

export async function setCommentLikeAction(id: string, liked: boolean) {
  return action("setCommentLike", async () => comments.setCommentLike(await getActor(), id, liked === true));
}

export async function reportPostAction(id: string, input: unknown) {
  return action("reportPost", async () => reports.reportPost(await getActor(), id, input));
}

export async function reportCommentAction(id: string, input: unknown) {
  return action("reportComment", async () => reports.reportComment(await getActor(), id, input));
}

export async function loadNotificationsAction() {
  return action("loadNotifications", async () => notifications.listNotifications(await getActor()));
}

export async function markNotificationsReadAction(ids: string[] | "all") {
  return action("markNotificationsRead", async () => notifications.markNotificationsRead(await getActor(), ids));
}
