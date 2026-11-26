import { describe, expect, it } from 'vitest';

import { articleNewsDate, articleSubTitleLine } from './article-news.util';

describe('articleNewsDate', () => {
  it('formats the stored date for readers', () => {
    expect(articleNewsDate({ properties: { datePublished: '20261126' } })).toBe('26.11.2026');
  });

  it('is empty without a date, or with a broken one', () => {
    expect(articleNewsDate(undefined)).toBe('');
    expect(articleNewsDate({ properties: {} })).toBe('');
    expect(articleNewsDate({ properties: { datePublished: '' } })).toBe('');
    expect(articleNewsDate({ properties: { datePublished: '2026-11-26' } })).toBe('');
    expect(articleNewsDate({ properties: { datePublished: 20261126 } })).toBe('');
  });
});

describe('articleSubTitleLine', () => {
  const article = { subTitle: 'Regatta in Luzern', properties: { datePublished: '20260514' } };

  it('is the subtitle when the article is not shown as news', () => {
    expect(articleSubTitleLine(article, false)).toBe('Regatta in Luzern');
  });

  it('is the date instead of the subtitle for news', () => {
    expect(articleSubTitleLine(article, true)).toBe('14.05.2026');
  });

  it('keeps the subtitle for news without a date', () => {
    expect(articleSubTitleLine({ subTitle: 'Regatta', properties: {} }, true)).toBe('Regatta');
    expect(articleSubTitleLine(undefined, true)).toBe('');
  });
});
