import { InjectionToken } from '@angular/core';

import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';

/**
 * Provided (as `true`) by the pages that show articles as news: the blog page and the news feed. An article drawn there shows its
 * date (`properties.datePublished`) where it otherwise shows its subtitle; nowhere else is the date shown. Not provided: false.
 */
export const ARTICLE_AS_NEWS = new InjectionToken<boolean>('ARTICLE_AS_NEWS');

interface NewsSource {
  subTitle?: string;
  properties?: unknown;
}

/** The date of an article as readers see it (dd.MM.yyyy); '' when it has none or a broken one. */
export function articleNewsDate(section: NewsSource | undefined): string {
  const stored = (section?.properties as { datePublished?: unknown } | undefined)?.datePublished;
  if (typeof stored !== 'string' || !/^\d{8}$/.test(stored)) return '';
  try {
    return convertDateFormatToString(stored, DateFormat.StoreDate, DateFormat.ViewDate, false);
  } catch {
    return '';
  }
}

/** What stands under the title: of news its date, falling back to the subtitle when it has no date; otherwise the subtitle. */
export function articleSubTitleLine(section: NewsSource | undefined, asNews: boolean): string {
  const subTitle = section?.subTitle ?? '';
  if (!asNews) return subTitle;
  return articleNewsDate(section) || subTitle;
}
