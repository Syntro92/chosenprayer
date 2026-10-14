import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { AuthAdmin } from "@/server/auth/auth-admin";
import { canModerateRole } from "@/server/auth/policy";
import { getPool, type Queryable } from "@/server/db";
import { listAuditLog } from "@/server/services/audit";
import { addComment } from "@/server/services/comments";
import {
  countOpenReports,
  dismissReport,
  listReports,
  pinPost,
  removeComment,
  removePost,
  setRole,
  suspendUser,
  unsuspendUser,
} from "@/server/services/moderation";
import { listNotifications } from "@/server/services/notifications";
import { getPost, listFeed } from "@/server/services/posts";
import { FakeStorage, member } from "../helpers/fixtures";
import { withRollback } from "../helpers/rollback";

afterAll(async () => {
  await getPool().end();
});

const store = () => new FakeStorage();

async function rawPost(c: Queryable, authorId: string, body = "a post") {
  const { rows } = await c.query<{ id: string }>("insert into public.posts (author_id, body) values ($1,$2) returning id", [authorId, body]);
  return rows[0].id;
}
async function report(c: Queryable, reporterId: string, target: { post?: string; comment?: string }, reason = "spam", note = "") {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.reports (reporter_id, post_id, comment_id, reason, note) values ($1,$2,$3,$4,$5) returning id",
    [reporterId, target.post ?? null, target.comment ?? null, reason, note],
  );
  return rows[0].id;
}
class FakeAuth implements AuthAdmin {
  calls: [string, boolean][] = [];
  async setBanned(userId: string, banned: boolean) {
    this.calls.push([userId, banned]);
  }
}

describe("canModerateRole", () => {
  it("admins act on members and moderators; moderators on members; nobody on admins", () => {
    expect(canModerateRole("admin", "member")).toBe(true);
    expect(canModerateRole("admin", "moderator")).toBe(true);
    expect(canModerateRole("admin", "admin")).toBe(false);
    expect(canModerateRole("moderator", "member")).toBe(true);
    expect(canModerateRole("moderator", "moderator")).toBe(false);
    expect(canModerateRole("moderator", "admin")).toBe(false);
    expect(canModerateRole("member", "member")).toBe(false);
  });
});

/* ======================================================================== */
describe("removePost", () => {
  it("hides the post, records who/when/why, closes its reports, notifies the author and writes the audit log", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator", name: "Mod" });
      const author = await member(c);
      const reporter = await member(c);
      const other = await member(c);
      const post = await rawPost(c, author.userId, "something rude");
      const r1 = await report(c, reporter.userId, { post }, "harassment");
      await report(c, other.userId, { post }, "spam");

      await removePost(mod, post, { reason: "  Harassment  " }, c);

      const row = (await c.query("select status, removed_by, removed_at, removal_reason from public.posts where id = $1", [post])).rows[0];
      expect(row).toMatchObject({ status: "removed", removed_by: mod.userId, removal_reason: "Harassment" });
      expect(row.removed_at).not.toBeNull();
      // gone for everyone
      await expect(getPost(author, post, c, store())).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await listFeed(other, { q: "something rude" }, c, store())).posts).toEqual([]);
      // both reports closed as actioned by the moderator
      const reports = (await c.query("select status, handled_by, resolution from public.reports where post_id = $1", [post])).rows;
      expect(reports).toHaveLength(2);
      for (const r of reports) expect(r).toMatchObject({ status: "actioned", handled_by: mod.userId, resolution: "Post removed: Harassment" });
      void r1;
      // the author is told why
      const n = await listNotifications(author, {}, c);
      expect(n.items.map((x) => x.text)).toContain("A moderator removed your post: Harassment");
      // audit trail
      const log = (await c.query("select action, entity_type, entity_id, actor_id, metadata from public.audit_log where entity_id = $1", [post])).rows;
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ action: "post.remove", entity_type: "post", actor_id: mod.userId });
      expect(log[0].metadata).toMatchObject({ reason: "Harassment", authorId: author.userId, closedReports: 2, excerpt: "something rude" });
    }));

  it("can't be repeated, and unknown ids 404", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const author = await member(c);
      const post = await rawPost(c, author.userId);
      await removePost(mod, post, { reason: "spam" }, c);
      await expect(removePost(mod, post, { reason: "spam" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(removePost(mod, randomUUID(), { reason: "spam" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(removePost(mod, "nope", { reason: "spam" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));

  it("requires a reason (1-300 chars)", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const post = await rawPost(c, (await member(c)).userId);
      for (const reason of ["", "   ", "x".repeat(301)]) {
        await expect(removePost(mod, post, { reason }, c)).rejects.toMatchObject({ name: "ZodError" });
      }
      await expect(removePost(mod, post, {}, c)).rejects.toMatchObject({ name: "ZodError" });
    }));

  it("is for moderators and admins only", () =>
    withRollback(async (c) => {
      const author = await member(c);
      const post = await rawPost(c, author.userId);
      await expect(removePost(null, post, { reason: "x" }, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(removePost(await member(c), post, { reason: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(removePost(await member(c, { role: "moderator", status: "suspended" }), post, { reason: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await c.query("select status from public.posts where id = $1", [post])).rows[0].status).toBe("visible");
    }));

  it("respects the hierarchy: moderators can't touch staff; admins can't touch admins", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const mod2 = await member(c, { role: "moderator" });
      const admin = await member(c, { role: "admin" });
      const admin2 = await member(c, { role: "admin" });
      const byMod2 = await rawPost(c, mod2.userId);
      const byAdmin = await rawPost(c, admin.userId);
      await expect(removePost(mod, byMod2, { reason: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(removePost(mod, byAdmin, { reason: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(removePost(admin2, byAdmin, { reason: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await removePost(admin2, byMod2, { reason: "x" }, c); // admin over moderator is fine
      expect((await c.query("select status from public.posts where id = $1", [byAdmin])).rows[0].status).toBe("visible");
    }));

  it("sends you to 'delete' for your own post", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const mine = await rawPost(c, mod.userId);
      await expect(removePost(mod, mine, { reason: "x" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
    }));
});

describe("removeComment", () => {
  it("removes the comment and its replies, fixes the count, closes reports, notifies and audits", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const author = await member(c);
      const replier = await member(c);
      const reporter = await member(c);
      const post = await rawPost(c, replier.userId);
      const top = (await addComment(author, { postId: post, text: "rude comment" }, c)).comment;
      const reply = (await addComment(replier, { postId: post, parentId: top.id, text: "reply" }, c)).comment;
      const keep = (await addComment(replier, { postId: post, text: "fine comment" }, c)).comment;
      const rid = await report(c, reporter.userId, { comment: top.id });
      const replyReport = await report(c, reporter.userId, { comment: reply.id });

      await removeComment(mod, top.id, { reason: "Rude" }, c);

      const states = (await c.query("select id, status from public.comments where post_id = $1", [post])).rows;
      expect(states.find((s) => s.id === top.id)!.status).toBe("removed");
      expect(states.find((s) => s.id === reply.id)!.status).toBe("removed");
      expect(states.find((s) => s.id === keep.id)!.status).toBe("visible");
      expect((await getPost(replier, post, c, store())).post.commentCount).toBe(1);
      for (const id of [rid, replyReport]) {
        expect((await c.query("select status, resolution from public.reports where id = $1", [id])).rows[0]).toMatchObject({
          status: "actioned",
          resolution: "Comment removed: Rude",
        });
      }
      const n = (await listNotifications(author, {}, c)).items;
      // (notifications created in one test transaction share a timestamp, so match by content, not position)
      expect(n.find((x) => x.text === "A moderator removed your comment: Rude")).toMatchObject({ href: `/community/posts/${post}` });
      const log = (await c.query("select metadata from public.audit_log where entity_id = $1 and action = 'comment.remove'", [top.id])).rows;
      expect(log[0].metadata).toMatchObject({ removedComments: 2, closedReports: 2, postId: post });
    }));

  it("enforces roles, hierarchy, reasons and existence", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const staff = await member(c, { role: "moderator" });
      const plain = await member(c);
      const post = await rawPost(c, plain.userId);
      const byStaff = (await addComment(staff, { postId: post, text: "staff words" }, c)).comment;
      const byPlain = (await addComment(plain, { postId: post, text: "plain words" }, c)).comment;
      const mine = (await addComment(mod, { postId: post, text: "mine" }, c)).comment;
      await expect(removeComment(plain, byStaff.id, { reason: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(removeComment(mod, byStaff.id, { reason: "x" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(removeComment(mod, mine.id, { reason: "x" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(removeComment(mod, byPlain.id, { reason: "" }, c)).rejects.toMatchObject({ name: "ZodError" });
      await expect(removeComment(mod, randomUUID(), { reason: "x" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await removeComment(mod, byPlain.id, { reason: "x" }, c);
      await expect(removeComment(mod, byPlain.id, { reason: "x" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});

/* ======================================================================== */
describe("listReports / countOpenReports", () => {
  it("lists open reports oldest first with the content, people and a per-content count", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const author = await member(c, { name: "Offender" });
      const a = await member(c, { name: "Reporter A" });
      const b = await member(c, { name: "Reporter B" });
      const post = await rawPost(c, author.userId, "bad post text");
      const second = await rawPost(c, author.userId, "another");
      const r1 = await report(c, a.userId, { post }, "spam", "looks like an ad");
      const r2 = await report(c, b.userId, { post }, "harassment");
      const r3 = await report(c, a.userId, { post: second }, "other");
      await c.query("update public.reports set created_at = now() - interval '30 minutes' where id = $1", [r1]);
      await c.query("update public.reports set created_at = now() - interval '20 minutes' where id = $1", [r2]);
      await c.query("update public.reports set created_at = now() - interval '10 minutes' where id = $1", [r3]);

      const page = await listReports(mod, {}, c);
      const mine = page.items.filter((i) => [r1, r2, r3].includes(i.id));
      expect(mine.map((i) => i.id)).toEqual([r1, r2, r3]);
      expect(mine[0]).toMatchObject({
        status: "open",
        reason: "spam",
        note: "looks like an ad",
        reporter: { name: "Reporter A" },
        openReports: 2,
        target: { kind: "post", id: post, postId: post, text: "bad post text", removed: false, author: { id: author.userId, name: "Offender", role: "member" } },
      });
      expect(mine[0].ageMinutes).toBeGreaterThan(29);
      expect(mine[2].openReports).toBe(1);
      expect(await countOpenReports(mod, c)).toBeGreaterThanOrEqual(3);
    }));

  it("shows comment reports with the comment text and its post", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const author = await member(c);
      const post = await rawPost(c, author.userId);
      const cm = (await addComment(author, { postId: post, text: "reported comment" }, c)).comment;
      const rid = await report(c, (await member(c)).userId, { comment: cm.id });
      const item = (await listReports(mod, {}, c)).items.find((i) => i.id === rid)!;
      expect(item.target).toMatchObject({ kind: "comment", id: cm.id, postId: post, text: "reported comment", attachments: 0 });
    }));

  it("'handled' lists closed reports, newest handled first, with who handled them", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator", name: "Handler" });
      const author = await member(c);
      const rep = await member(c);
      const p1 = await rawPost(c, author.userId, "first");
      const p2 = await rawPost(c, author.userId, "second");
      const r1 = await report(c, rep.userId, { post: p1 });
      const r2 = await report(c, rep.userId, { post: p2 });
      await dismissReport(mod, r1, { resolution: "fine" }, c);
      await removePost(mod, p2, { reason: "bad" }, c);
      await c.query("update public.reports set handled_at = now() - interval '1 hour' where id = $1", [r1]);

      const handled = (await listReports(mod, { status: "handled", limit: 50 }, c)).items.filter((i) => [r1, r2].includes(i.id));
      expect(handled.map((i) => i.id)).toEqual([r2, r1]);
      expect(handled[0]).toMatchObject({ status: "actioned", handledBy: "Handler", resolution: "Post removed: bad" });
      expect(handled[1]).toMatchObject({ status: "dismissed", resolution: "fine" });
      expect((await listReports(mod, {}, c)).items.some((i) => [r1, r2].includes(i.id))).toBe(false);
    }));

  it("pages through the queue without skipping or repeating", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const author = await member(c);
      const rep = await member(c);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = await report(c, rep.userId, { post: await rawPost(c, author.userId, `p${i}`) });
        await c.query("update public.reports set created_at = now() - ($2 || ' minutes')::interval where id = $1", [id, String(60 - i)]);
        ids.push(id);
      }
      const all = (await listReports(mod, { limit: 50 }, c)).items.map((i) => i.id).filter((id) => ids.includes(id));
      const walked: string[] = [];
      let cursor: string | undefined;
      let guard = 0;
      do {
        const page = await listReports(mod, { limit: 2, cursor }, c);
        walked.push(...page.items.map((i) => i.id).filter((id) => ids.includes(id)));
        cursor = page.nextCursor ?? undefined;
      } while (cursor && ++guard < 100);
      expect(walked).toEqual(all);
      expect(new Set(walked).size).toBe(5);
    }));

  it("rejects bad cursors and non-moderators", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      await expect(listReports(mod, { cursor: "garbage" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(listReports(await member(c), {}, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listReports(null, {}, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(countOpenReports(await member(c), c)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }));
});

describe("dismissReport", () => {
  it("closes every open report on that content, leaves other content alone, and audits", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const author = await member(c);
      const [a, b] = [await member(c), await member(c)];
      const p1 = await rawPost(c, author.userId);
      const p2 = await rawPost(c, author.userId);
      const r1 = await report(c, a.userId, { post: p1 });
      const r2 = await report(c, b.userId, { post: p1 });
      const other = await report(c, a.userId, { post: p2 });

      expect(await dismissReport(mod, r1, { resolution: "  all good " }, c)).toEqual({ closed: 2 });
      const rows = (await c.query("select id, status, handled_by, resolution from public.reports where id = any($1)", [[r1, r2, other]])).rows;
      expect(rows.find((r) => r.id === r1)).toMatchObject({ status: "dismissed", handled_by: mod.userId, resolution: "all good" });
      expect(rows.find((r) => r.id === r2)!.status).toBe("dismissed");
      expect(rows.find((r) => r.id === other)!.status).toBe("open");
      // the post itself is untouched
      expect((await c.query("select status from public.posts where id = $1", [p1])).rows[0].status).toBe("visible");
      const log = (await c.query("select metadata from public.audit_log where action = 'report.dismiss' and entity_id = $1", [r1])).rows;
      expect(log[0].metadata).toMatchObject({ closedReports: 2, postId: p1 });
    }));

  it("can't be done twice, on unknown reports, or by members", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const author = await member(c);
      const r = await report(c, (await member(c)).userId, { post: await rawPost(c, author.userId) });
      await expect(dismissReport(await member(c), r, {}, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await dismissReport(mod, r, {}, c);
      await expect(dismissReport(mod, r, {}, c)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(dismissReport(mod, randomUUID(), {}, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(dismissReport(mod, "nope", {}, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});

/* ======================================================================== */
describe("suspend / unsuspend / setRole (admins only)", () => {
  it("suspends: profile status flips, sign-in is banned, audit written, and they can't act", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const target = await member(c);
      const auth = new FakeAuth();
      await suspendUser(admin, target.userId, { reason: "Repeated harassment" }, c, auth);
      expect((await c.query("select status from public.profiles where id = $1", [target.userId])).rows[0].status).toBe("suspended");
      expect(auth.calls).toEqual([[target.userId, true]]);
      const log = (await c.query("select metadata from public.audit_log where action = 'user.suspend' and entity_id = $1", [target.userId])).rows;
      expect(log[0].metadata).toMatchObject({ reason: "Repeated harassment" });
      // a suspended member's own session no longer counts as an active member
      await expect(listFeed({ ...target, status: "suspended" }, {}, c, store())).rejects.toMatchObject({ code: "FORBIDDEN" });
    }));

  it("unsuspends and lifts the ban", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const target = await member(c, { status: "suspended" });
      const auth = new FakeAuth();
      await unsuspendUser(admin, target.userId, c, auth);
      expect((await c.query("select status from public.profiles where id = $1", [target.userId])).rows[0].status).toBe("active");
      expect(auth.calls).toEqual([[target.userId, false]]);
      await expect(unsuspendUser(admin, target.userId, c, auth)).rejects.toMatchObject({ code: "CONFLICT" });
    }));

  it("won't suspend yourself, an admin, or someone already suspended; needs a reason", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const otherAdmin = await member(c, { role: "admin" });
      const already = await member(c, { status: "suspended" });
      const auth = new FakeAuth();
      await expect(suspendUser(admin, admin.userId, { reason: "x" }, c, auth)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(suspendUser(admin, otherAdmin.userId, { reason: "x" }, c, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(suspendUser(admin, already.userId, { reason: "x" }, c, auth)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(suspendUser(admin, (await member(c)).userId, { reason: "" }, c, auth)).rejects.toMatchObject({ name: "ZodError" });
      await expect(suspendUser(admin, randomUUID(), { reason: "x" }, c, auth)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(auth.calls).toEqual([]);
    }));

  it("moderators and members can't suspend or change roles", () =>
    withRollback(async (c) => {
      const mod = await member(c, { role: "moderator" });
      const target = await member(c);
      await expect(suspendUser(mod, target.userId, { reason: "x" }, c, new FakeAuth())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(unsuspendUser(mod, target.userId, c, new FakeAuth())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setRole(mod, target.userId, { role: "moderator" }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(suspendUser(null, target.userId, { reason: "x" }, c, new FakeAuth())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }));

  it("setRole: promotes/demotes with an audit entry, not yourself, not to nonsense, no-op when unchanged", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const target = await member(c);
      await setRole(admin, target.userId, { role: "moderator" }, c);
      expect((await c.query("select role from public.profiles where id = $1", [target.userId])).rows[0].role).toBe("moderator");
      await setRole(admin, target.userId, { role: "moderator" }, c); // no-op
      await setRole(admin, target.userId, { role: "member" }, c);
      const log = (await c.query("select metadata from public.audit_log where action = 'user.set_role' and entity_id = $1 order by id", [target.userId])).rows;
      expect(log.map((l) => [l.metadata.from, l.metadata.to])).toEqual([["member", "moderator"], ["moderator", "member"]]);
      await expect(setRole(admin, admin.userId, { role: "member" }, c)).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(setRole(admin, target.userId, { role: "owner" }, c)).rejects.toMatchObject({ name: "ZodError" });
      await expect(setRole(admin, randomUUID(), { role: "member" }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});

describe("listAuditLog", () => {
  it("is admin-only, newest first, filterable and paginated", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin", name: "The Admin" });
      const mod = await member(c, { role: "moderator" });
      const author = await member(c);
      const p1 = await rawPost(c, author.userId, "one");
      const p2 = await rawPost(c, author.userId, "two");
      await removePost(mod, p1, { reason: "r1" }, c);
      await removePost(mod, p2, { reason: "r2" }, c);
      await setRole(admin, author.userId, { role: "moderator" }, c);

      const all = await listAuditLog(admin, { limit: 50 }, c);
      const mine = all.items.filter((i) => [p1, p2, author.userId].includes(i.entityId ?? ""));
      expect(mine.map((i) => i.action)).toEqual(["user.set_role", "post.remove", "post.remove"]);
      expect(mine[0].actor).toMatchObject({ name: "The Admin" });
      expect(mine[1].metadata).toMatchObject({ reason: "r2" });

      const onlyPosts = await listAuditLog(admin, { entityType: "post", limit: 50 }, c);
      expect(onlyPosts.items.every((i) => i.entityType === "post")).toBe(true);

      const p = await listAuditLog(admin, { limit: 1 }, c);
      expect(p.items).toHaveLength(1);
      expect(p.nextCursor).not.toBeNull();
      const p2nd = await listAuditLog(admin, { limit: 1, cursor: p.nextCursor! }, c);
      expect(p2nd.items[0].id).toBeLessThan(p.items[0].id);

      await expect(listAuditLog(mod, {}, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listAuditLog(null, {}, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(listAuditLog(admin, { cursor: encodeBad() }, c)).rejects.toMatchObject({ code: "VALIDATION" });
    }));
});
const encodeBad = () => Buffer.from(JSON.stringify({ k: "text", id: "1" })).toString("base64url");

/* ======================================================================== */
describe("pinPost", () => {
  it("admin pins and unpins; the pinned post leads page one of the feed once, then returns to its place; audited", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin", name: "Ada" });
      const author = await member(c);
      const older = await rawPost(c, author.userId, "older post");
      await c.query("update public.posts set created_at = now() - interval '2 days' where id = $1", [older]);
      const newer = await rawPost(c, author.userId, "newer post");

      await pinPost(admin, older, { pinned: true }, c);
      const feed = await listFeed(admin, {}, c, store());
      expect(feed.posts.slice(0, 2).map((p) => p.id)).toEqual([older, newer]);
      expect(feed.posts[0].pinned).toBe(true);
      expect(feed.posts.filter((p) => p.id === older)).toHaveLength(1); // never listed twice
      expect(feed.posts[1].pinned).toBeUndefined();

      // Search / other tabs don't special-case pins.
      const search = await listFeed(admin, { q: "older post" }, c, store());
      expect(search.posts.map((p) => p.id)).toContain(older);

      await pinPost(admin, older, { pinned: false }, c);
      const after = await listFeed(admin, {}, c, store());
      expect(after.posts.slice(0, 1).map((p) => p.id)).toEqual([newer]);
      expect(after.posts.find((p) => p.id === older)?.pinned).toBeUndefined();

      const log = await listAuditLog(admin, { entityType: "post" }, c);
      expect(log.items.map((i) => i.action)).toEqual(expect.arrayContaining(["post.pin", "post.unpin"]));
    }));

  it("is admin-only, validates input, ignores no-ops and caps at three", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const mod = await member(c, { role: "moderator" });
      const m = await member(c);
      const post = await rawPost(c, m.userId);
      await expect(pinPost(null, post, { pinned: true }, c)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(pinPost(m, post, { pinned: true }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(pinPost(mod, post, { pinned: true }, c)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(pinPost(admin, "not-a-uuid", { pinned: true }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(pinPost(admin, randomUUID(), { pinned: true }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(pinPost(admin, post, { pinned: "yes" }, c)).rejects.toThrow();

      await pinPost(admin, post, { pinned: true }, c);
      await pinPost(admin, post, { pinned: true }, c); // no-op, no second audit row
      const log = await listAuditLog(admin, { entityType: "post" }, c);
      expect(log.items.filter((i) => i.action === "post.pin")).toHaveLength(1);

      const two = await rawPost(c, m.userId);
      const three = await rawPost(c, m.userId);
      const four = await rawPost(c, m.userId);
      await pinPost(admin, two, { pinned: true }, c);
      await pinPost(admin, three, { pinned: true }, c);
      await expect(pinPost(admin, four, { pinned: true }, c)).rejects.toMatchObject({ code: "CONFLICT" });
    }));

  it("a removed post can't be pinned", () =>
    withRollback(async (c) => {
      const admin = await member(c, { role: "admin" });
      const m = await member(c);
      const post = await rawPost(c, m.userId);
      await removePost(admin, post, { reason: "spam" }, c);
      await expect(pinPost(admin, post, { pinned: true }, c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});
