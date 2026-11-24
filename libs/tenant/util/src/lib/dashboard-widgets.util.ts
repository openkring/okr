/**
 * Dashboard widgets (spec 1.174 §8): a widget is a section of a dashboard page. A tenant hides
 * one through `app-config.hiddenWidgets`, and the widget of a switched-off block is not shown.
 */

/** Section type of a dashboard widget → the feature block it belongs to. Other types have none. */
export const WIDGET_BLOCKS: Readonly<Record<string, string>> = {
  events: 'calevent',
  invitations: 'calevent',
  tasks: 'task',
  messages: 'chat',
};

/** The key of a widget: the section key without the `_<tenantId>` of a tenant's own copy. */
export function widgetKeyOf(sectionOkey: string, tenantId: string): string {
  const suffix = `_${tenantId}`;
  return tenantId && sectionOkey.endsWith(suffix) ? sectionOkey.slice(0, -suffix.length) : sectionOkey;
}

/** The feature block that owns a section type, `undefined` when it is always available. */
export function widgetBlockOf(type: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(WIDGET_BLOCKS, type) ? WIDGET_BLOCKS[type] : undefined;
}

/**
 * Does the tenant show this widget? Hiding only narrows: the section's state and role are checked elsewhere.
 * Both sides are normalized, so a page key that itself ends in `_<tenantId>` matches too.
 */
export function isWidgetVisible(
  section: { okey: string; type: string },
  tenantId: string,
  hidden: readonly string[] | null | undefined,
  isEnabled: (block: string) => boolean,
): boolean {
  const block = widgetBlockOf(section.type);
  if (block && !isEnabled(block)) return false;
  const key = widgetKeyOf(section.okey, tenantId);
  return !(hidden ?? []).some(h => widgetKeyOf(h, tenantId) === key);
}

/**
 * The next `hiddenWidgets` list after showing or hiding one widget. Keys of other widgets stay —
 * they may belong to another dashboard page — and a key is never listed twice. With a tenant id,
 * an entry that still carries the `_<tenantId>` suffix counts as the same widget.
 */
export function withWidgetVisibility(
  hidden: readonly string[] | null | undefined,
  key: string,
  visible: boolean,
  tenantId = '',
): string[] {
  const current = hidden ?? [];
  const wanted = widgetKeyOf(key, tenantId);
  const isListed = (h: string): boolean => widgetKeyOf(h, tenantId) === wanted;
  if (visible) return current.filter(h => !isListed(h));
  return current.some(isListed) ? [...current] : [...current, key];
}
