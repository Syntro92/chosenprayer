"use server";

import { revalidateTag } from "next/cache";
import { action } from "@/server/action";
import { getActor } from "@/server/auth/session";
import * as follows from "@/server/services/follows";

export interface FollowState {
  signedIn: boolean;
  following: boolean;
}

/** Called by the follow button on mount: is there a signed-in viewer, and do they follow? */
export async function getFollowStateAction(handle: string) {
  return action("getFollowState", async (): Promise<FollowState> => {
    const actor = await getActor();
    return { signedIn: !!actor && actor.status === "active", following: await follows.isFollowing(actor, handle) };
  });
}

export async function followAction(handle: string) {
  return action("follow", async () => {
    const result = await follows.followChannel(await getActor(), handle);
    revalidateTag(`channel:${String(handle).toLowerCase()}`, "max");
    return result;
  });
}

export async function unfollowAction(handle: string) {
  return action("unfollow", async () => {
    const result = await follows.unfollowChannel(await getActor(), handle);
    revalidateTag(`channel:${String(handle).toLowerCase()}`, "max");
    return result;
  });
}
