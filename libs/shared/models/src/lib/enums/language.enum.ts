export enum Language {
  GE,
  EN,
  FR,
  ES,
  IT,
}

export const DefaultLanguage = Language.GE;

// Canonical ordered list of supported language codes — the single source of truth for the code
// list. MUST stay index-aligned with the Language enum above (GE=0 → 'de', …): AppStore maps
// userLanguage → code via AvailableLanguages[enum]. Do NOT reorder.
// The Languages category array (@okr/shared-categories) is pinned to this tuple at compile time
// (and additionally parity-checked in language.spec.ts), so drift is a type error, not a silent bug.
export const LanguageCodes = ['de', 'en', 'fr', 'es', 'it'] as const;

export type LanguageCode = (typeof LanguageCodes)[number];

// Same list as a plain mutable string[], which is what Transloco's availableLangs, the i18n
// service and AppConfig.enabledLanguages consume.
export const AvailableLanguages: string[] = [...LanguageCodes];

// Default language as a code (for Transloco defaultLang and the i18n fallback), derived from the enum.
export const DefaultLanguageCode = AvailableLanguages[DefaultLanguage];
