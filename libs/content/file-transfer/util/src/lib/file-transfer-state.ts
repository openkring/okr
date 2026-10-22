import type { FileTransferModel } from '@okr/shared-models';

/** ISO timestamp (UTC) `lifetimeDays` after `nowIso`. */
export function computeExpiresAt(nowIso: string, lifetimeDays: number): string {
  const d = new Date(nowIso);
  d.setUTCDate(d.getUTCDate() + lifetimeDays);
  return d.toISOString();
}

export function isFileTransferAccessible(t: Pick<FileTransferModel, 'state' | 'expiresAt'>, nowIso: string): boolean {
  return t.state === 'open' && new Date(t.expiresAt).getTime() > new Date(nowIso).getTime();
}

/**
 * The state as people see it. A transfer whose lifetime ran out but which the hourly reaper has
 * not marked yet already reads 'expired' — its links refuse it anyway.
 */
export function fileTransferDisplayState(t: Pick<FileTransferModel, 'state' | 'expiresAt'>, nowIso: string): FileTransferModel['state'] {
  if (t.state === 'open' && !isFileTransferAccessible(t, nowIso)) return 'expired';
  return t.state;
}
