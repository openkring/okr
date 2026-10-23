import type { Signal } from '@angular/core';

// mirrors the lib path: libs/content/learning/util/src/i18n/<lang>.json
const PFX = '@content/learning/util.';

/** Strings of the learning rooms (spec 1.115): validation messages and room-view labels.
 *  Resolved store-driven via I18nService.translateAll. `{n}` placeholders use single braces → fill(). */
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
  // room view (toolbar, tabs, empty states)
  tab_files:                       PFX + 'tab.files',
  tab_videos:                      PFX + 'tab.videos',
  tab_images:                      PFX + 'tab.images',
  search_placeholder:              PFX + 'search.placeholder',
  topic_all:                       PFX + 'topic.all',
  empty_files:                     PFX + 'empty.files',
  empty_videos:                    PFX + 'empty.videos',
  empty_images:                    PFX + 'empty.images',
  // rating stars
  rating_label:                    PFX + 'rating.label',
  rating_none:                     PFX + 'rating.none',
  rating_belowOne:                 PFX + 'rating.belowOne',
  rating_one:                      PFX + 'rating.one',
  rating_many:                     PFX + 'rating.many',
  // item badges and actions
  item_notes:                      PFX + 'item.notes',
  item_videoUnavailable:           PFX + 'item.videoUnavailable',
  item_open:                       PFX + 'item.open',
  item_download:                   PFX + 'item.download',
} satisfies Record<string, string>;

export type LearningI18n = { [K in keyof typeof LEARNING_I18N_KEYS]: Signal<string> };
