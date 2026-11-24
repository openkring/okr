import { AvailableLanguages } from '@okr/shared-models';

/**
 * Splits an i18n key into the (module, key) pair an `i18nTenantOverride` row addresses it by:
 * '@tag.ezs' → { module: 'tag', key: 'ezs' }. Legacy raw entries without the '@' prefix
 * (e.g. the icon/task lists) have no translation and yield undefined.
 */
export function toI18nRef(i18nKey: string): { module: string; key: string } | undefined {
  if (!i18nKey.startsWith('@')) return undefined;
  const rest = i18nKey.substring(1);
  const dot = rest.indexOf('.');
  if (dot <= 0 || dot === rest.length - 1) return undefined;
  return { module: rest.substring(0, dot), key: rest.substring(dot + 1) };
}

/**
 * One label per language for a key that no bundle holds: an empty language would show the raw key,
 * so it takes the first label entered, or `name` when there is none.
 */
export function completeLabels(values: Readonly<Record<string, string>>, name: string): Record<string, string> {
  const entered = (lang: string) => (values[lang] ?? '').trim();
  const fallback = AvailableLanguages.map(entered).find(Boolean) ?? name;
  return Object.fromEntries(AvailableLanguages.map(lang => [lang, entered(lang) || fallback]));
}
