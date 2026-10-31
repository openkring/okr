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

function normalize(prev: Partial<ServerBadgeLedger> | undefined): ServerBadgeLedger {
  return {
    chat: prev?.chat ?? 0,
    tasks: prev?.tasks ?? 0,
    invitations: prev?.invitations ?? 0,
    seen: prev?.seen ? [...prev.seen] : [],
    fromApp: prev?.fromApp ?? false,
  };
}

/** Counts a chat event once; a repeated event id leaves the ledger unchanged. */
export function addChatToLedger(prev: Partial<ServerBadgeLedger> | undefined, eventId: string): { next: ServerBadgeLedger; changed: boolean } {
  const next = normalize(prev);
  if (next.seen.includes(eventId)) return { next, changed: false };
  next.chat += 1;
  next.seen.push(eventId);
  if (next.seen.length > SERVER_BADGE_SEEN_MAX) next.seen = next.seen.slice(next.seen.length - SERVER_BADGE_SEEN_MAX);
  return { next, changed: true };
}

/** Sets one absolute part (tasks or invitations); keeps everything else. */
export function setLedgerPart(prev: Partial<ServerBadgeLedger> | undefined, part: 'tasks' | 'invitations', n: number): ServerBadgeLedger {
  const next = normalize(prev);
  next[part] = Math.max(0, n);
  return next;
}

/** The ledger fields for a write from the app: only the given parts, plus `fromApp: true`. */
export function ledgerPartsFromApp(parts: Partial<BadgeParts>): Partial<ServerBadgeLedger> & { fromApp: true } {
  const out: Partial<ServerBadgeLedger> & { fromApp: true } = { fromApp: true };
  if (parts.chat !== undefined) out.chat = Math.max(0, parts.chat);
  if (parts.tasks !== undefined) out.tasks = Math.max(0, parts.tasks);
  if (parts.invitations !== undefined) out.invitations = Math.max(0, parts.invitations);
  return out;
}

/** The badge total, or undefined until the app has written the parts. */
export function serverBadgeSum(l: Partial<ServerBadgeLedger> | undefined): number | undefined {
  if (!l?.fromApp) return undefined;
  return (l.chat ?? 0) + (l.tasks ?? 0) + (l.invitations ?? 0);
}

/** The new sum when both sums are known and it is lower than before, else undefined. */
export function badgeSumDropped(before: Partial<ServerBadgeLedger> | undefined, after: Partial<ServerBadgeLedger> | undefined): number | undefined {
  const b = serverBadgeSum(before);
  const a = serverBadgeSum(after);
  if (b === undefined || a === undefined) return undefined;
  return a < b ? a : undefined;
}
