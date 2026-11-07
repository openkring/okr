// libs/content/notice/util/src/lib/notice.util.ts
import { NoticeModel } from '@okr/shared-models';

/**
 * The reader's notices of one tenant, newest first. The «my notices» query filters on `recipients`, the
 * one array filter Firestore allows per query, so the tenant and the archive flag are applied here.
 */
export function noticesOfTenant(notices: NoticeModel[], tenantId: string, maxItems?: number): NoticeModel[] {
  const list = notices
    .filter((n) => !n.isArchived && (n.tenants ?? []).includes(tenantId))
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
  return maxItems && maxItems > 0 ? list.slice(0, maxItems) : list;
}
