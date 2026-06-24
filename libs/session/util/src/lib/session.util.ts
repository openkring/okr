import { SessionModel } from '@bk2/shared-models';

export type SessionStatus = 'active' | 'stale' | 'orphaned' | 'ended';

/*-------------------------- search index --------------------------------*/
/**
 * Create a lowercased search index for a session: "userEmail browser os".
 * For anonymous sessions the (empty) email is dropped by the trim/normalisation.
 */
export function getSessionIndex(session: SessionModel): string {
  return `${session.userEmail} ${session.browser} ${session.os}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getSessionIndexInfo(): string {
  return 'e:userEmail b:browser o:os';
}

/*-------------------------- runtime status ------------------------------*/
/** Parse a StoreDateTime (yyyyMMddHHmmss) into epoch millis (local time). */
function parseStoreDateTime(sdt: string): number {
  const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1, d = +sdt.slice(6, 8);
  const h = +sdt.slice(8, 10), mi = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
  return new Date(y, mo, d, h, mi, s).getTime();
}

/**
 * Derive a session's runtime status from its activity and last heartbeat.
 * @param nowMs current time in millis (injected for testability)
 */
export function getSessionStatus(session: SessionModel, nowMs: number): SessionStatus {
  if (!session.isActive) return 'ended';
  if (!session.lastSeenAt || session.lastSeenAt.length < 14) return 'active';
  const ageMin = (nowMs - parseStoreDateTime(session.lastSeenAt)) / 60_000;
  if (ageMin > 30) return 'orphaned';
  if (ageMin > 10) return 'stale';
  return 'active';
}

export function getSessionStatusColor(status: SessionStatus): string {
  switch (status) {
    case 'active': return 'success';
    case 'stale': return 'tertiary';
    case 'orphaned': return 'warning';
    case 'ended': return 'medium';
  }
}
