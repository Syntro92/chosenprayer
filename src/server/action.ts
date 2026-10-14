import "server-only";
import { fail, ok, toAppError, type Result } from "./errors";
import { errorFields, log } from "./logger";

/**
 * Wrap the body of every Server Action:
 *
 *   export async function createPost(input: unknown) {
 *     "use server";
 *     return action("createPost", async () => { ... return data; });
 *   }
 *
 * Expected failures (validation, auth, rate limits...) come back as
 * `{ ok: false, error }` for the UI to render; unexpected ones are logged and
 * returned as a generic INTERNAL error so no internals leak to the browser.
 */
export async function action<T>(name: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    const err = toAppError(e);
    if (err.code === "INTERNAL" || err.code === "UNAVAILABLE") {
      log.error("server action failed", { action: name, ...errorFields(err.cause ?? e) });
    }
    return fail(err);
  }
}
