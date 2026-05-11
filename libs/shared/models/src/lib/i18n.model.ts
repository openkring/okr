export type I18nString = Record<string, string>;

export function i18nString(de: string, en?: string): I18nString {
  const result: I18nString = { de };
  if (en !== undefined) result['en'] = en;
  return result;
}

export function resolveI18n(val: I18nString | undefined, lang: string): string {
  if (!val) return '';
  return val[lang] ?? val['de'] ?? '';
}
