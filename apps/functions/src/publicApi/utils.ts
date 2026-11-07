export type I18nString = Record<string, string>;

export function storeDateToIso(storeDate: string): string {
  if (!storeDate || storeDate.length !== 8) return '';
  return `${storeDate.slice(0, 4)}-${storeDate.slice(4, 6)}-${storeDate.slice(6, 8)}`;
}

export function locationName(locationKey: string): string {
  if (!locationKey) return '';
  const at = locationKey.lastIndexOf('@');
  return at > 0 ? locationKey.slice(0, at) : locationKey;
}

export function parseTags(tags: string): string[] {
  if (!tags) return [];
  return tags.split(',').map(t => t.trim()).filter(Boolean);
}

export function mapCategory(type: string): string {
  const map: Record<string, string> = {
    regatta: 'regatta', club: 'club', course: 'course', training: 'training',
  };
  return map[type] ?? type;
}

export function titleToI18n(title: string, titleI18n?: I18nString): I18nString {
  if (titleI18n && Object.keys(titleI18n).length > 0) return titleI18n;
  return { de: title ?? '' };
}

/**
 * Whether a section may leave the app. Same strict check as the app's content page, so a section
 * without a state stays hidden. Deliberately about the section, not its page: the website pages
 * are `isPrivate` and in state draft, so gating on the page would blank the websites.
 */
export function isPublishedSection(section: { state?: string }): boolean {
  return section.state === 'published';
}

export function setCacheHeaders(res: import('express').Response): void {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
}
