"use server";

import { action } from "@/server/action";
import { getActor } from "@/server/auth/session";
import * as moderation from "@/server/services/moderation";

// Thin adapters: identify the caller, call the service, return { ok, data } | { ok: false, error }.
// Role checks (moderator / admin) and the "who may act on whom" rules live in the service.

export async function loadReportsAction(query: unknown) {
  return action("loadReports", async () => moderation.listReports(await getActor(), query));
}

export async function removePostAsModeratorAction(postId: string, input: unknown) {
  return action("moderatorRemovePost", async () => moderation.removePost(await getActor(), postId, input));
}

export async function removeCommentAsModeratorAction(commentId: string, input: unknown) {
  return action("moderatorRemoveComment", async () => moderation.removeComment(await getActor(), commentId, input));
}

export async function pinPostAction(postId: string, input: unknown) {
  return action("pinPost", async () => moderation.pinPost(await getActor(), postId, input));
}

export async function dismissReportAction(reportId: string, input: unknown) {
  return action("dismissReport", async () => moderation.dismissReport(await getActor(), reportId, input));
}

export async function suspendUserAction(userId: string, input: unknown) {
  return action("suspendUser", async () => moderation.suspendUser(await getActor(), userId, input));
}

export async function unsuspendUserAction(userId: string) {
  return action("unsuspendUser", async () => moderation.unsuspendUser(await getActor(), userId));
}

export async function setRoleAction(userId: string, input: unknown) {
  return action("setRole", async () => moderation.setRole(await getActor(), userId, input));
}
