import type { BadgeParts } from './badge-ledger.util';

/**
 * Pure logic of the server badge ledger `users/{uid}/badge/counts` (spec 1.127 §3.7).
 * Mirrors `BadgeCountsModel` in `@okr/shared-models` (util-core must not import models).
 */
export interface ServerBadgeLedger {
  chat: number;
  tasks: number;
  invitations: number;
  seen: string[];
  fromApp: boolean;
}

/** How many counted chat event ids `seen` keeps for de-duplication. */
export const SERVER_BADGE_SEEN_MAX = 200;

/** The largest value a ledger part or the badge sum can take (also enforced by firestore.rules). */
export const SERVER_BADGE_MAX = 9999;

/** A part is valid when it is a finite integer; the ledger is owner-writable, so never trust it. */
function isFiniteInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function part(n: unknown): number {
  return isFiniteInt(n) ? Math.min(Math.max(n, 0), SERVER_BADGE_MAX) : 0;
}

/** Floors and clamps an app-supplied count to `0..SERVER_BADGE_MAX` (NaN becomes 0). */
function clampCount(n: number): number {
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), SERVER_BADGE_MAX) : 0;
}

function normalize(prev: Partial<ServerBadgeLedger> | undefined): ServerBadgeLedger {
  const seen: unknown = prev?.seen;
  return {
    chat: part(prev?.chat),
    tasks: part(prev?.tasks),
    invitations: part(prev?.invitations),
    seen: Array.isArray(seen) ? seen.filter((e): e is string => typeof e === 'string') : [],
    fromApp: prev?.fromApp === true,
  };
}

/** Counts a chat event once; a repeated event id leaves the ledger unchanged. */
export function addChatToLedger(prev: Partial<ServerBadgeLedger> | undefined, eventId: string): { next: ServerBadgeLedger; changed: boolean } {
  const next = normalize(prev);
  if (next.seen.includes(eventId)) return { next, changed: false };
  next.chat = Math.min(next.chat + 1, SERVER_BADGE_MAX);
  next.seen.push(eventId);
  if (next.seen.length > SERVER_BADGE_SEEN_MAX) next.seen = next.seen.slice(next.seen.length - SERVER_BADGE_SEEN_MAX);
  return { next, changed: true };
}

/** Sets one absolute part (tasks or invitations); keeps everything else. */
export function setLedgerPart(prev: Partial<ServerBadgeLedger> | undefined, which: 'tasks' | 'invitations', n: number): ServerBadgeLedger {
  const next = normalize(prev);
  next[which] = clampCount(n);
  return next;
}

/** The ledger fields for a write from the app: only the given parts, plus `fromApp: true`. */
export function ledgerPartsFromApp(parts: Partial<BadgeParts>): Partial<ServerBadgeLedger> & { fromApp: true } {
  const out: Partial<ServerBadgeLedger> & { fromApp: true } = { fromApp: true };
  if (parts.chat !== undefined) out.chat = clampCount(parts.chat);
  if (parts.tasks !== undefined) out.tasks = clampCount(parts.tasks);
  if (parts.invitations !== undefined) out.invitations = clampCount(parts.invitations);
  return out;
}

/** The badge total, or undefined until the app has written the parts. */
export function serverBadgeSum(l: Partial<ServerBadgeLedger> | undefined): number | undefined {
  if (l?.fromApp !== true) return undefined;
  const parts: unknown[] = [l.chat, l.tasks, l.invitations];
  if (parts.some((p) => p !== undefined && !isFiniteInt(p))) return undefined;
  const sum = parts.reduce<number>((acc, p) => acc + (p === undefined ? 0 : (p as number)), 0);
  return Math.min(Math.max(sum, 0), SERVER_BADGE_MAX);
}

/** The new sum when both sums are known and it is lower than before, else undefined. */
export function badgeSumDropped(before: Partial<ServerBadgeLedger> | undefined, after: Partial<ServerBadgeLedger> | undefined): number | undefined {
  const b = serverBadgeSum(before);
  const a = serverBadgeSum(after);
  if (b === undefined || a === undefined) return undefined;
  return a < b ? a : undefined;
}

/** Which badge parts the open app has really loaded (spec 1.127 N1). */
export interface BadgePartsReady {
  chat: boolean;
  tasks: boolean;
  invitations: boolean;
}

/**
 * Only the parts whose source has loaded. Before that a part reads 0, and writing that 0 to the
 * server ledger would lower the badge on the member's other iOS devices (B2 push).
 */
export function readyBadgeParts(parts: BadgeParts, ready: BadgePartsReady): Partial<BadgeParts> {
  const out: Partial<BadgeParts> = {};
  if (ready.chat) out.chat = parts.chat;
  if (ready.tasks) out.tasks = parts.tasks;
  if (ready.invitations) out.invitations = parts.invitations;
  return out;
}

/** True once every part has loaded: only then does the app know the full (absolute) badge total. */
export function allPartsReady(ready: BadgePartsReady): boolean {
  return ready.chat && ready.tasks && ready.invitations;
}
