import { describe, expect, it } from 'vitest';

import { isJournalModeField, journalModeSectionFields } from './journal-mode.util';

describe('journalModeSectionFields', () => {
  it('hero: the cover, the overlay and the layout', () => {
    expect(journalModeSectionFields('hero')).toEqual(['hero', 'overlay', 'height', 'focus']);
  });
  it('article: the photos and their style (title and text are not properties)', () => {
    expect(journalModeSectionFields('article')).toEqual(['images', 'imageStyle', 'imageLayout']);
  });
  it('album: the explicit photo list instead of the folder', () => {
    expect(journalModeSectionFields('album')).toEqual(['images']);
  });
  it('video: the explicit clip list instead of the url', () => {
    expect(journalModeSectionFields('video')).toEqual(['clips']);
  });
  it('a type the journal does not edit: no property at all', () => {
    expect(journalModeSectionFields('map')).toEqual([]);
    expect(journalModeSectionFields('form')).toEqual([]);
  });
  it('returns a copy, so a caller cannot change the list for everybody', () => {
    journalModeSectionFields('album').push('folder');
    expect(journalModeSectionFields('album')).toEqual(['images']);
  });
});

describe('isJournalModeField', () => {
  it('names the edited keys only', () => {
    expect(isJournalModeField('hero', 'overlay')).toBe(true);
    expect(isJournalModeField('hero', 'logo')).toBe(false);
    expect(isJournalModeField('hero', 'ctas')).toBe(false);
    expect(isJournalModeField('album', 'folder')).toBe(false);
    expect(isJournalModeField('video', 'url')).toBe(false);
    expect(isJournalModeField('article', 'cta')).toBe(false);
  });
});
