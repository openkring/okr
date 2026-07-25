export enum Language {
  GE,
  EN,
  FR,
  ES,
  IT,
}

export const DefaultLanguage = Language.GE;

// Canonical ordered list of supported language codes. MUST stay index-aligned with the Language
// enum above (GE=0 → 'de', …): AppStore maps userLanguage → code via AvailableLanguages[enum].
// The Languages category array (@okr/shared-categories) is parity-checked against this in
// language.spec.ts. Do NOT reorder.
export const AvailableLanguages = ['de', 'en', 'fr', 'es', 'it'];

// Default language as a code (for Transloco defaultLang and the i18n fallback), derived from the enum.
export const DefaultLanguageCode = AvailableLanguages[DefaultLanguage];
