import type { TransportMode } from '@okr/shared-models';
import { staticSuite } from 'vest';
import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { dateValidations, stringValidations, timeValidations } from '@okr/shared-util-core';

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
