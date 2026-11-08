import { enforce, staticSuite, test } from 'vest';
import { NEWS_SEGMENTS } from '@okr/shared-models';

export const NEWS_REQUEST_NOTE_MAX = 500;

/** What the suggest-a-channel form edits. */
export interface NewsRequestFormData {
  segment: string;
  url: string;
  note: string;
}

const V = '@social/news-center/util.validation.';

export const newsRequestValidations = staticSuite((model: NewsRequestFormData) => {
  test('segment', V + 'segment', () => {
    enforce(NEWS_SEGMENTS.includes(model.segment as never)).isTruthy();
  });
  test('url', V + 'urlRequired', () => {
    enforce(model.url.trim()).isNotEmpty();
  });
  test('url', V + 'urlInvalid', () => {
    if (model.url.trim()) enforce(isHttpUrl(model.url.trim())).isTruthy();
  });
  test('note', V + 'noteTooLong', () => {
    enforce(model.note.length).lessThanOrEquals(NEWS_REQUEST_NOTE_MAX);
  });
});

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\/[^\s/]/i.test(value)) return false;
  try {
    return new URL(value).hostname.length > 0;
  } catch {
    return false;
  }
}
