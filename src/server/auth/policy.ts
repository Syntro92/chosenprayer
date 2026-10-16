import { AppError } from "../errors";

// Pure permission rules (no I/O) so they are trivially unit-testable.
// No "server-only": the Actor type is safe to share.

export type Role = "member" | "moderator" | "admin";
export type AccountStatus = "active" | "suspended";

/** Who is making a request. `null` everywhere means "anonymous visitor". */
export interface Actor {
  userId: string;
  username: string;
  displayName: string;
  /** Saved language code (profile default), e.g. "ES". */
  locale?: string;
  role: Role;
  status: AccountStatus;
  /** Signed in with an admin-issued temporary password that has not been replaced yet. */
  mustChangePassword?: boolean;
}

const RANK: Record<Role, number> = { member: 1, moderator: 2, admin: 3 };

/** admin >= moderator >= member. */
export function hasRole(actor: Actor | null, min: Role): boolean {
  return !!actor && actor.status === "active" && RANK[actor.role] >= RANK[min];
}

/** Must be signed in AND not suspended. The standard gate for any write. */
export function requireMember(actor: Actor | null): Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  if (actor.status !== "active") throw new AppError("FORBIDDEN", "Your account is suspended.");
  return actor;
}

export function requireRole(actor: Actor | null, min: Role): Actor {
  const a = requireMember(actor);
  if (RANK[a.role] < RANK[min]) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  return a;
}

/** Allows the owner of a resource, or anyone at least `min` (e.g. moderators removing content). */
export function requireOwnerOrRole(actor: Actor | null, ownerId: string | null | undefined, min: Role): Actor {
  const a = requireMember(actor);
  if (ownerId && a.userId === ownerId) return a;
  if (RANK[a.role] >= RANK[min]) return a;
  throw new AppError("FORBIDDEN", "You don't have permission to do that.");
}

/**
 * Who may act on whose content: admins on members and moderators, moderators on members only.
 * Nobody moderates an admin (an admin must be demoted by another admin first).
 */
export function canModerateRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "admin") return targetRole !== "admin";
  if (actorRole === "moderator") return targetRole === "member";
  return false;
}
