import type { JournalBookModel, JournalBookPrint, TransportMode } from '@okr/shared-models';
import { omitWhen, staticSuite } from 'vest';
import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { dateValidations, numberValidations, stringsValidations, stringValidations, timeValidations } from '@okr/shared-util-core';

/**
 * Form models and Vest suites of the travel journal (spec 1.113 §9.2, building-forms skill). The
 * footprint's position comes from its photos and is not edited here.
 */
export interface FootprintFormModel {
  title: string;
  placeName: string;
  date: string; // StoreDate or ''
  time: string; // HH:mm or ''
  published: boolean;
  transport: TransportMode | ''; // '' = not set
}

export function newFootprintFormModel(): FootprintFormModel {
  return { title: '', placeName: '', date: '', time: '', published: false, transport: '' };
}

export const footprintValidations = staticSuite((model: FootprintFormModel) => {
  stringValidations('title', model.title, LONG_NAME_LENGTH, 0, true);
  stringValidations('placeName', model.placeName, LONG_NAME_LENGTH);
  dateValidations('date', model.date);
  timeValidations('time', model.time);
});

export interface TextBlockFormModel { text: string }

export const textBlockValidations = staticSuite((model: TextBlockFormModel) => {
  stringValidations('text', model.text, DESCRIPTION_LENGTH, 0, true);
});

/** The author's message to the guests (plan 8): subject and text; links are added per guest when sending. */
export interface NoticeFormModel { subject: string; text: string }
export const NOTICE_SUBJECT_MAX = 120;
export const NOTICE_TEXT_MAX = 4000;

export const noticeValidations = staticSuite((model: NoticeFormModel) => {
  stringValidations('subject', model.subject, NOTICE_SUBJECT_MAX, 0, true);
  stringValidations('text', model.text, NOTICE_TEXT_MAX, 0, true);
});

const escapeHtml = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeHtml = (v: string): string =>
  v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** Plain text from the textarea → HTML: blank lines separate paragraphs, single newlines become <br>. */
export function plainTextToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** HTML of a text block → plain text for editing; other markup is dropped. */
export function htmlToPlainText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  return unescapeHtml(withBreaks.replace(/<[^>]+>/g, '')).trim();
}

/**
 * The book settings (design §5.1, §5.3): title and subtitle (defaults from the journal), the cover photo ('' = the
 * automatic choice) and the print settings. Spine and wrap only count with a cover.
 */
export type BookCoverType = JournalBookPrint['cover'];
export const BOOK_COVER_TYPES: BookCoverType[] = ['none', 'softcover', 'hardcover'];
export const BOOK_BLEED_MAX_MM = 10;
export const BOOK_PAGE_MULTIPLE_MAX = 16;
export const BOOK_SPINE_MAX_MM = 100;
export const BOOK_WRAP_MAX_MM = 30;

export interface BookSettingsFormModel {
  title: string;
  subTitle: string;
  coverImageKey: string;
  bleedMm: number;
  pageMultiple: number;
  cover: BookCoverType;
  spineMm: number;
  wrapMm: number;
}

/** The form model of a book; `journal` gives the defaults of title and subtitle. */
export function bookSettingsOf(book: JournalBookModel, journal: { title: string; subTitle: string } | undefined): BookSettingsFormModel {
  const print = book.print;
  return {
    title: book.title || journal?.title || '',
    subTitle: book.subTitle ?? journal?.subTitle ?? '',
    coverImageKey: book.coverImageKey ?? '',
    bleedMm: print?.bleedMm ?? 3,
    pageMultiple: print?.pageMultiple ?? 4,
    cover: print?.cover ?? 'none',
    spineMm: print?.spineMm ?? 0,
    wrapMm: print?.wrapMm ?? 0,
  };
}

/** The book fields the settings write (title, subTitle, coverImageKey, print); nothing another writer touches. */
export function bookSettingsPatch(model: BookSettingsFormModel): Pick<JournalBookModel, 'title' | 'subTitle' | 'coverImageKey' | 'print'> {
  return {
    title: model.title.trim(),
    subTitle: model.subTitle.trim(),
    coverImageKey: model.coverImageKey,
    print: {
      bleedMm: Number(model.bleedMm), pageMultiple: Math.round(Number(model.pageMultiple)), iccProfile: 'fogra39', cover: model.cover,
      spineMm: Number(model.spineMm) || 0, wrapMm: Number(model.wrapMm) || 0,
    },
  };
}

export const bookSettingsValidations = staticSuite((model: BookSettingsFormModel) => {
  stringValidations('title', model.title, LONG_NAME_LENGTH);
  stringValidations('subTitle', model.subTitle, LONG_NAME_LENGTH);
  numberValidations('bleedMm', model.bleedMm, false, 0, BOOK_BLEED_MAX_MM);
  numberValidations('pageMultiple', model.pageMultiple, true, 1, BOOK_PAGE_MULTIPLE_MAX);
  stringsValidations('cover', model.cover, BOOK_COVER_TYPES);
  omitWhen(model.cover === 'none', () => {
    numberValidations('spineMm', model.spineMm, false, 0, BOOK_SPINE_MAX_MM);
    numberValidations('wrapMm', model.wrapMm, false, 0, BOOK_WRAP_MAX_MM);
  });
});
