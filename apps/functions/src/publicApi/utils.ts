import type { I18nString } from '@bk2/shared-models';

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

export function resolveI18n(val: I18nString | undefined, lang: string): string {
  if (!val) return '';
  return val[lang] ?? val['de'] ?? '';
}

export function titleToI18n(title: string, titleI18n?: I18nString): I18nString {
  if (titleI18n && Object.keys(titleI18n).length > 0) return titleI18n;
  return { de: title ?? '' };
}

export function setCacheHeaders(res: import('express').Response): void {
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
}
