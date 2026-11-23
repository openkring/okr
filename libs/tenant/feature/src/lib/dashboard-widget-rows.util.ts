import { isWidgetVisible, widgetBlockOf, widgetKeyOf } from '@okr/tenant-util';

/** A section of the dashboard page together with the page key it was read by (`@TID@` not yet resolved). */
export interface WidgetEntry {
  pageKey: string;
  section: { type: string; title?: string; state: string };
}

export interface WidgetRow {
  /** What `hiddenWidgets` stores: the page key with `@TID@` resolved, without the tenant suffix. */
  key: string;
  type: string;
  title: string;
  visible: boolean;
  isDraft: boolean;
  block: string | undefined;
  blockOn: boolean;
  /** Members have no other menu row for open invitations. */
  onlyHere: boolean;
}

/** One row per dashboard section, in page order. */
export function buildWidgetRows(
  entries: readonly WidgetEntry[],
  tenantId: string,
  hidden: readonly string[] | null | undefined,
  isEnabled: (block: string) => boolean,
): WidgetRow[] {
  return entries.map(({ pageKey, section }) => {
    const key = widgetKeyOf(pageKey.replace('@TID@', tenantId), tenantId);
    const block = widgetBlockOf(section.type);
    const blockOn = !block || isEnabled(block);
    return {
      key,
      type: section.type,
      title: section.title ?? '',
      visible: isWidgetVisible({ okey: key, type: section.type }, tenantId, hidden, () => true),
      isDraft: section.state === 'draft',
      block,
      blockOn,
      onlyHere: section.type === 'invitations' && blockOn,
    };
  });
}
