import "server-only";
import { getActor } from "./auth/session";
import { requireRole, type Actor, type Role } from "./auth/policy";
import { AppError } from "./errors";
import { handler } from "./http";

type Params = Record<string, string>;

/**
 * Wraps an /api/admin/* route: same-origin check on writes (via `handler`), the signed-in actor
 * loaded fresh from the session, and the minimum role enforced BEFORE the route body runs.
 * The services check the role again, so a forgotten guard here can never expose data.
 */
export function adminRoute(
  fn: (req: Request, ctx: { actor: Actor; params: Params }) => Promise<Response>,
  min: Role = "admin",
  /** Only the endpoints that let a user finish signing in (who am I, change password) set this. */
  opts: { allowTempPassword?: boolean } = {},
) {
  return handler<{ params: Promise<Params> }>(async (req, ctx) => {
    const actor = requireRole(await getActor(), min);
    if (actor.mustChangePassword && !opts.allowTempPassword) {
      throw new AppError("FORBIDDEN", "Please choose a new password before continuing.");
    }
    const params = ctx?.params ? await ctx.params : {};
    return fn(req, { actor, params });
  });
}
