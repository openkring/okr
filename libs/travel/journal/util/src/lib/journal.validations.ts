import { staticSuite } from 'vest';
import { stringValidations } from '@okr/shared-util-core';
import type { JournalFormModel } from './journal-edit.util';

/** Caps of the «Reisetagebuch ändern» form; the template's `[maxLength]` is bound to the same constants. */
export const JOURNAL_TITLE_MAX = 80;
export const JOURNAL_SUBTITLE_MAX = 120;
export const JOURNAL_LABEL_MAX = 120;

export const journalValidations = staticSuite((model: JournalFormModel) => {
  stringValidations('title', model.title, JOURNAL_TITLE_MAX, 0, true);
  stringValidations('subTitle', model.subTitle, JOURNAL_SUBTITLE_MAX);
  stringValidations('coverLabel', model.coverLabel, JOURNAL_LABEL_MAX);
  stringValidations('lastPageLabel', model.lastPageLabel, JOURNAL_LABEL_MAX);
});
