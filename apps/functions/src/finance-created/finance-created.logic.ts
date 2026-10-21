import { zurichStoreDateTime } from '../finance-history/finance-history.logic';

/**
 * `createdAt` (StoreDateTime, Swiss local time) of a new booking, bill or invoice, taken from the document's
 * Firestore create time. undefined when the writer already stamped one — the trigger never overwrites it.
 * The accounting overview lists what was created since the treasurer's last visit from this field.
 */
export function createdAtPatch(data: Record<string, unknown> | undefined, createTime: Date): { createdAt: string } | undefined {
  if (!data) return undefined;
  const existing = data['createdAt'];
  if (typeof existing === 'string' && existing.length > 0) return undefined;
  return { createdAt: zurichStoreDateTime(createTime) };
}
