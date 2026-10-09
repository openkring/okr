/**
 * The app-icon badge ledger (spec 1.93, `2026-10-09-push-badge-ledger-spec.md`).
 *
 * `setAppBadge()` takes an ABSOLUTE value, and no push sender knows a person's total
 * (chat unread over this tenant's rooms + open tasks + open invitations). So the total is
 * kept on the device: the page writes the three parts whenever the foreground badge changes,
 * and each push updates only the part it knows. The badge is always the sum.
 *
 * The push service worker (`apps/*\/src/firebase-messaging-sw.js`) cannot import this lib and
 * carries a plain-JS twin of {@link applyBadgePush}. Change both together.
 */

/** IndexedDB location shared by the page and the push service worker (same origin). */
export const BADGE_LEDGER_DB = 'okr-badge';
export const BADGE_LEDGER_STORE = 'ledger';
export const BADGE_LEDGER_KEY = 'counts';
/** How many counted push ids `seen` keeps for de-duplication. */
export const BADGE_LEDGER_SEEN_MAX = 100;

export interface BadgeLedger {
  chat: number;
  tasks: number;
  invitations: number;
  /** Ids of the pushes already counted (chat event ids, invitation keys), newest last. */
  seen: string[];
  /**
   * True once the page has written the parts. Until then the parts are not trustworthy, and
   * the service worker leaves the badge alone rather than show a sum built from zeros.
   */
  fromPage: boolean;
  updatedAt: number;
}

/** The badge parts the page knows while the app is open. */
export interface BadgeParts {
  chat: number;
  tasks: number;
  invitations: number;
}

/** The badge fields of a push's `data` map (all strings — FCM data values are strings). */
export interface BadgePushData {
  /** Absolute open-task count of the recipient (task pushes). */
  badgeTasks?: string;
  /** One new item of this kind (chat message, invitation), de-duplicated by `badgeId`. */
  badgeAdd?: string;
  badgeId?: string;
  /** Absolute chat count (`badge-sync` pushes, spec 1.93 §5). */
  badgeChat?: string;
}

export interface BadgePushResult {
  /** The ledger to store, or undefined when nothing changed. */
  ledger: BadgeLedger | undefined;
  /** The badge to show, or undefined when the badge must not be touched. */
  badge: number | undefined;
}

export function emptyBadgeLedger(now = 0): BadgeLedger {
  return { chat: 0, tasks: 0, invitations: 0, seen: [], fromPage: false, updatedAt: now };
}

export function badgeLedgerTotal(ledger: BadgeLedger): number {
  return ledger.chat + ledger.tasks + ledger.invitations;
}

/** A count from a push field: a non-negative integer, or undefined when absent or garbage. */
function parseCount(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.max(0, value) : undefined;
}

/**
 * The page's absolute write: replaces the three parts, keeps `seen` so a late push for an
 * item already counted is still recognised, and marks the ledger as trustworthy.
 */
export function badgeLedgerFromPage(previous: BadgeLedger | undefined, parts: BadgeParts, now: number): BadgeLedger {
  return {
    chat: Math.max(0, parts.chat),
    tasks: Math.max(0, parts.tasks),
    invitations: Math.max(0, parts.invitations),
    seen: previous?.seen ?? [],
    fromPage: true,
    updatedAt: now,
  };
}

/**
 * What one push does to the ledger and the badge (spec 1.93 §2.2, §2.3).
 *
 *  - `badgeTasks`              → `tasks` replaced (absolute)
 *  - `badgeChat`               → `chat` replaced (absolute, `badge-sync`)
 *  - `badgeAdd` + `badgeId`    → that part + 1, unless the id was already counted
 *  - anything else             → ledger unchanged, the stored sum is re-applied
 *
 * The badge is the sum — 0 is a real value (clear), there is no floor — but only once the
 * page has written the ledger; before that it is undefined (leave the badge alone).
 */
export function applyBadgePush(
  previous: BadgeLedger | undefined,
  data: BadgePushData,
  now: number,
): BadgePushResult {
  let next: BadgeLedger | undefined;

  const tasks = parseCount(data.badgeTasks);
  const chat = parseCount(data.badgeChat);
  if (tasks !== undefined || chat !== undefined) {
    next = { ...(previous ?? emptyBadgeLedger()), updatedAt: now };
    if (tasks !== undefined) next.tasks = tasks;
    if (chat !== undefined) next.chat = chat;
  }

  const add = data.badgeAdd;
  const id = data.badgeId ?? '';
  if ((add === 'chat' || add === 'invitation') && id) {
    const base = next ?? previous ?? emptyBadgeLedger();
    if (!base.seen.includes(id)) {
      const part = add === 'chat' ? 'chat' : 'invitations';
      next = {
        ...base,
        [part]: base[part] + 1,
        seen: [...base.seen, id].slice(-BADGE_LEDGER_SEEN_MAX),
        updatedAt: now,
      };
    }
  }

  const current = next ?? previous;
  return {
    ledger: next,
    badge: current?.fromPage ? badgeLedgerTotal(current) : undefined,
  };
}
