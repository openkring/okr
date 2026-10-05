import { ActivityModel, SessionModel } from '@okr/shared-models';
import { addDuration, DateFormat, parseDate } from '@okr/shared-util-core';

/** One day of the activity statistics chart. */
export type DailyActivityStats = {
  day: string;            // StoreDate yyyyMMdd
  users: number;          // distinct signed-in users with a session on that day
  logins: number;         // successful logins
  errors: number;         // failed logins and failed password-reset requests
  usageMinutes: number;   // signed-in time, overlapping sessions of one user counted once
};

export const ACTIVITY_STATS_DAYS = 30;

/*-------------------------- auth outcome --------------------------------*/
// AuthService writes the outcome into the payload: '<who>: SUCCESS…' or '<who>: ERROR…'.

export function isLoginSuccess(activity: ActivityModel): boolean {
  return activity.scope === 'auth' && activity.action === 'login' && /: SUCCESS\b/.test(activity.payload ?? '');
}

export function isAuthError(activity: ActivityModel): boolean {
  return activity.scope === 'auth'
    && (activity.action === 'login' || activity.action === 'pwdreset')
    && /: ERROR\b/.test(activity.payload ?? '');
}

/*-------------------------- daily statistics --------------------------------*/

type Interval = { start: number; end: number };

function toMillis(storeDateTime: string | undefined): number | undefined {
  if (!storeDateTime || storeDateTime.length < 14) return undefined;
  return parseDate(storeDateTime, DateFormat.StoreDateTime, false)?.getTime();
}

/**
 * A session's signed-in interval: from its start to its end, or to its last heartbeat when it
 * never ended properly (closed tab, crash) — at most one heartbeat period short.
 */
function sessionInterval(session: SessionModel): Interval | undefined {
  const start = toMillis(session.startedAt);
  if (start === undefined) return undefined;
  const end = toMillis(session.endedAt) ?? toMillis(session.lastSeenAt) ?? start;
  return { start, end: Math.max(start, end) };
}

/** Merge overlapping intervals so several tabs of one user count once. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  return merged;
}

/**
 * Per-day usage statistics for the `days` days ending on `lastDay` (StoreDate), oldest first.
 * Logins and errors come from the auth activities, users and usage time from the sessions.
 * Anonymous sessions (no userKey) are visitors and are left out. A session running past midnight
 * is split across both days.
 */
export function getDailyActivityStats(
  activities: ActivityModel[],
  sessions: SessionModel[],
  lastDay: string,
  days = ACTIVITY_STATS_DAYS,
): DailyActivityStats[] {
  const rows: DailyActivityStats[] = [];
  const bounds: Interval[] = [];
  for (let n = days - 1; n >= 0; n--) {
    const day = addDuration(lastDay, { days: -n });
    const start = parseDate(day, DateFormat.StoreDate, false)?.getTime() ?? 0;
    const end = parseDate(addDuration(day, { days: 1 }), DateFormat.StoreDate, false)?.getTime() ?? 0;
    rows.push({ day, users: 0, logins: 0, errors: 0, usageMinutes: 0 });
    bounds.push({ start, end });
  }
  const rowByDay = new Map(rows.map(r => [r.day, r]));

  for (const activity of activities) {
    const row = rowByDay.get((activity.timestamp ?? '').substring(0, 8));
    if (!row) continue;
    if (isLoginSuccess(activity)) row.logins++;
    else if (isAuthError(activity)) row.errors++;
  }

  const byUser = new Map<string, Interval[]>();
  for (const session of sessions) {
    if (!session.userKey) continue;
    const interval = sessionInterval(session);
    if (!interval) continue;
    byUser.set(session.userKey, [...(byUser.get(session.userKey) ?? []), interval]);
  }

  const usageMs = rows.map(() => 0);
  for (const intervals of byUser.values()) {
    const merged = mergeIntervals(intervals);
    bounds.forEach((b, i) => {
      let present = false;
      for (const m of merged) {
        const overlap = Math.min(m.end, b.end) - Math.max(m.start, b.start);
        // a zero-length session (no heartbeat yet) still marks the user as present on its day
        if (overlap > 0 || (m.start === m.end && m.start >= b.start && m.start < b.end)) present = true;
        usageMs[i] += Math.max(0, overlap);
      }
      if (present) rows[i].users++;
    });
  }
  rows.forEach((r, i) => r.usageMinutes = Math.round(usageMs[i] / 60_000));
  return rows;
}
