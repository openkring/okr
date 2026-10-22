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
