/**
 * Wire types of the CardDAV mirror's admin callable `contactsDavAdmin` (spec 1.159 §7), shared by
 * the function and the modal — like `VcardExportRequest`.
 */

/** How often the scheduled job rebuilds the book; `manual` = only «Jetzt aktualisieren». */
export type RebuildInterval = 'weekly' | 'daily' | 'manual';
export const DEFAULT_REBUILD_INTERVAL: RebuildInterval = 'weekly';

export type ContactsDavOp = 'status' | 'mint' | 'revoke' | 'refresh' | 'setInterval';

export interface ContactsDavAdminRequest {
  tenantId: string;
  op: ContactsDavOp;
  /** `setInterval` only */
  interval?: RebuildInterval;
}

export interface ContactsDavStatus {
  /** the URL the device is pointed at, with `https://` and a trailing slash */
  serverUrl: string;
  /** shown as the account name; the server ignores it */
  username: string;
  hasToken: boolean;
  /** the plain password — only in the answer to `mint`, never again */
  token?: string;
  /** StoreDate */
  lastUsedAt?: string;
  /** ISO timestamp of the last rebuild */
  builtAt?: string;
  cardCount?: number;
  rebuildInterval: RebuildInterval;
}
