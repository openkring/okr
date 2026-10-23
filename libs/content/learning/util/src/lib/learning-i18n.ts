import type { Signal } from '@angular/core';

// mirrors the lib path: libs/content/learning/util/src/i18n/<lang>.json
const PFX = '@content/learning/util.';

/** Validation messages of the learning rooms (spec 1.115). Resolved store-driven via I18nService.translateAll. */
export const LEARNING_I18N_KEYS = {
  validation_titleRequired:        PFX + 'validation.titleRequired',
  validation_titleTooLong:         PFX + 'validation.titleTooLong',
  validation_notesTooLong:         PFX + 'validation.notesTooLong',
  validation_tooManyLinks:         PFX + 'validation.tooManyLinks',
  validation_linkTitle:            PFX + 'validation.linkTitle',
  validation_linkUrl:              PFX + 'validation.linkUrl',
  validation_nameRequired:         PFX + 'validation.nameRequired',
  validation_nameTooLong:          PFX + 'validation.nameTooLong',
  validation_folderRequired:       PFX + 'validation.folderRequired',
  validation_tooManyTopics:        PFX + 'validation.tooManyTopics',
  validation_curatorsPersonsOnly:  PFX + 'validation.curatorsPersonsOnly',
} satisfies Record<string, string>;

export type LearningI18n = { [K in keyof typeof LEARNING_I18N_KEYS]: Signal<string> };
