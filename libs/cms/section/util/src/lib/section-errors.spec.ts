import { describe, expect, it } from 'vitest';

import { ARTICLE_IMAGES_SEGMENT_FIELDS, getErrorSegments, getFieldErrors, HERO_SEGMENT_FIELDS, getImageErrors, getInlineErrorFields, getJournalInlineErrorFields, getRemainingErrors, getUnrenderedFixedKeys, isInlineErrorField } from './section-errors';

describe('getInlineErrorFields', () => {
  it('always offers the base fields of section-configuration', () => {
    expect(getInlineErrorFields('map')).toEqual(expect.arrayContaining(['title', 'subTitle']));
  });

  it('offers `name` only in advanced mode (the field is hidden otherwise)', () => {
    expect(getInlineErrorFields('map')).not.toContain('name');
    expect(getInlineErrorFields('map', true)).toContain('name');
  });

  it('offers the chat properties under their prefixed vest names', () => {
    expect(getInlineErrorFields('chat')).toEqual(expect.arrayContaining(['chat.id', 'chat.name', 'chat.url']));
  });

  it('offers the button sub-configs only in advanced mode', () => {
    expect(getInlineErrorFields('button')).not.toContain('action.url');
    expect(getInlineErrorFields('button', true)).toContain('action.url');
  });
});

describe('isInlineErrorField', () => {
  it('matches an exact field name', () => {
    expect(isInlineErrorField('title', ['title', 'subTitle'])).toBe(true);
    expect(isInlineErrorField('okey', ['title', 'subTitle'])).toBe(false);
  });

  it('matches every indexed image field through the images[ prefix', () => {
    expect(isInlineErrorField('images[2].url', ['images['])).toBe(true);
  });
});

describe('getRemainingErrors', () => {
  it('keeps only the errors no field renders itself', () => {
    const errors = { title: ['tooLong'], okey: ['required'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toEqual([{ field: 'okey', messages: ['required'] }]);
  });

  it('hides an image error from the fallback list — the image list shows it', () => {
    const errors = { 'images[0].url': ['imageUrlStart'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toEqual([]);
  });

  it('falls back for a field that is hidden behind the advanced toggle', () => {
    const errors = { name: ['tooLong'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toEqual([{ field: 'name', messages: ['tooLong'] }]);
    expect(getRemainingErrors(errors, getInlineErrorFields('article', true))).toEqual([]);
  });
});

describe('getFieldErrors', () => {
  it('returns the messages of a field', () => {
    expect(getFieldErrors({ title: ['tooLong'] }, 'title')).toEqual(['tooLong']);
  });

  it('returns an empty array for a field without errors and for undefined errors', () => {
    expect(getFieldErrors({ title: ['tooLong'] }, 'subTitle')).toEqual([]);
    expect(getFieldErrors(undefined, 'title')).toEqual([]);
  });
});

describe('getImageErrors', () => {
  it('flattens every indexed image message and ignores the other fields', () => {
    const errors = { 'images[0].url': ['imageUrlStart'], 'images[1].label': ['tooLong'], title: ['tooLong'] };
    expect(getImageErrors(errors)).toEqual(['imageUrlStart', 'tooLong']);
  });

  it('returns an empty array without errors', () => {
    expect(getImageErrors(undefined)).toEqual([]);
    expect(getImageErrors({})).toEqual([]);
  });
});

describe('form section error fields', () => {
  it('shows the fixed values of every implicit field inline, so none lands in the fallback list', () => {
    const inline = getInlineErrorFields('form');
    expect(isInlineErrorField('implicitValues.courseId', inline)).toBe(true);
    expect(isInlineErrorField('implicitValues.level', inline)).toBe(true);
    expect(isInlineErrorField('formKey', inline)).toBe(true);
    expect(isInlineErrorField('maxResponses', inline)).toBe(true);
    expect(isInlineErrorField('okey', inline)).toBe(false);
  });
});

describe('getUnrenderedFixedKeys', () => {
  it('lists the fixed-value errors of entries that have no row', () => {
    const errors = { 'implicitValues.ssnId': ['x'], 'implicitValues.courseId': ['y'], title: ['z'] };
    expect(getUnrenderedFixedKeys(errors, ['courseId'])).toEqual(['ssnId']);
    expect(getUnrenderedFixedKeys(errors, [])).toEqual(['ssnId', 'courseId']);
  });

  it('is empty without errors', () => {
    expect(getUnrenderedFixedKeys(undefined, [])).toEqual([]);
    expect(getUnrenderedFixedKeys({}, ['courseId'])).toEqual([]);
  });
});

describe('tiles and call-to-action error fields (1.151)', () => {
  it('shows every tiles error inline, so none lands in the fallback list', () => {
    const errors = { 'tiles.columns': ['invalidValue'], 'tiles.i0.title': ['required'], 'tiles.i2.url': ['invalidValue'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('tiles'))).toEqual([]);
  });

  it('shows the hero buttons inline, the list rule and each indexed field', () => {
    const errors = { ctas: ['invalidValue'], 'ctas[0].label': ['required'], 'ctas[1].url': ['invalidValue'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('hero'))).toEqual([]);
  });

  it('shows the layout and the image action of an article inline without the advanced toggle (Layout segment)', () => {
    const errors = { imageLayout: ['invalidValue'], action: ['invalidValue'], zoomFactor: ['invalidValue'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toEqual([]);
  });

  it('shows the article image styles inline only with the advanced toggle (Styles segment)', () => {
    const errors = { width: ['notString'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toHaveLength(1);
    expect(getRemainingErrors(errors, getInlineErrorFields('article', true))).toEqual([]);
  });

  it('shows the article button inline', () => {
    const errors = { 'cta.label': ['required'], 'cta.url': ['invalidValue'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toEqual([]);
  });

  it('does not hide a tiles-like key of another section type', () => {
    const errors = { 'tiles.columns': ['invalidValue'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toHaveLength(1);
  });
});

describe('getJournalInlineErrorFields (journal mode, 1.154)', () => {
  it('falls back for every field the journal form hides, so a hidden invalid field never blocks saving silently', () => {
    const errors = { subTitle: ['tooLong'], 'cta.label': ['required'], folder: ['notString'], url: ['notString'] };
    for (const type of ['hero', 'article', 'album', 'video'] as const) {
      expect(getRemainingErrors(errors, getJournalInlineErrorFields(type))).toHaveLength(4);
    }
  });

  it('shows the title, the photos and the layout of an article inline', () => {
    const errors = { title: ['tooLong'], 'images[0].url': ['required'], imageLayout: ['invalidValue'] };
    expect(getRemainingErrors(errors, getJournalInlineErrorFields('article'))).toEqual([]);
  });

  it('falls back for the image style of an article, which the journal no longer shows (no Styles segment)', () => {
    const errors = { width: ['notString'], action: ['invalidValue'] };
    expect(getRemainingErrors(errors, getJournalInlineErrorFields('article')).map((e) => e.field)).toEqual(['width', 'action']);
  });

  it('shows the overlay and layout of a hero inline, but not its hidden title or buttons', () => {
    const errors = { 'overlay.darkening': ['invalidValue'], height: ['invalidValue'], focus: ['invalidValue'], title: ['tooLong'], 'ctas[0].label': ['required'] };
    expect(getRemainingErrors(errors, getJournalInlineErrorFields('hero')).map((e) => e.field)).toEqual(['title', 'ctas[0].label']);
  });

  it('shows the clip limit of a video inline, under the clip list', () => {
    expect(getRemainingErrors({ clips: ['clipsTooMany'] }, getJournalInlineErrorFields('video'))).toEqual([]);
  });
});

describe('getErrorSegments (segmented cards, 1.154)', () => {
  const all = ['select', 'layout', 'styles'] as const;

  it('returns no segment without errors', () => {
    expect(getErrorSegments({}, ARTICLE_IMAGES_SEGMENT_FIELDS, all)).toEqual([]);
    expect(getErrorSegments(undefined, ARTICLE_IMAGES_SEGMENT_FIELDS, all)).toEqual([]);
  });

  it('maps the article fields to their segment, in segment order', () => {
    const errors = { width: ['notString'], action: ['invalidValue'], 'images[2].url': ['required'] };
    expect(getErrorSegments(errors, ARTICLE_IMAGES_SEGMENT_FIELDS, all)).toEqual(['select', 'layout', 'styles']);
    expect(getErrorSegments({ imageLayout: ['invalidValue'] }, ARTICLE_IMAGES_SEGMENT_FIELDS, all)).toEqual(['layout']);
    expect(getErrorSegments({ zoomFactor: ['invalidValue'] }, ARTICLE_IMAGES_SEGMENT_FIELDS, all)).toEqual(['layout']);
  });

  it('leaves out segments that are not offered and errors of other fields', () => {
    const errors = { width: ['notString'], title: ['tooLong'] };
    expect(getErrorSegments(errors, ARTICLE_IMAGES_SEGMENT_FIELDS, ['select', 'layout'])).toEqual([]);
  });

  it('ignores a field with an empty message list', () => {
    expect(getErrorSegments({ action: [] }, ARTICLE_IMAGES_SEGMENT_FIELDS, all)).toEqual([]);
  });

  it('maps the hero fields, overlay by prefix', () => {
    const segments = ['image', 'overlay', 'layout'] as const;
    expect(getErrorSegments({ 'overlay.darkening': ['invalidValue'] }, HERO_SEGMENT_FIELDS, segments)).toEqual(['overlay']);
    expect(getErrorSegments({ focus: ['invalidValue'], imgIxParams: ['tooLong'] }, HERO_SEGMENT_FIELDS, segments)).toEqual(['image', 'layout']);
    expect(getErrorSegments({ overlay: ['x'] }, HERO_SEGMENT_FIELDS, segments)).toEqual([]);
  });
});
