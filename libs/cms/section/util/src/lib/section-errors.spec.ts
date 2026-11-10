import { describe, expect, it } from 'vitest';

import { getFieldErrors, getImageErrors, getInlineErrorFields, getRemainingErrors, getUnrenderedFixedKeys, isInlineErrorField } from './section-errors';

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

  it('shows the article button inline', () => {
    const errors = { 'cta.label': ['required'], 'cta.url': ['invalidValue'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toEqual([]);
  });

  it('does not hide a tiles-like key of another section type', () => {
    const errors = { 'tiles.columns': ['invalidValue'] };
    expect(getRemainingErrors(errors, getInlineErrorFields('article'))).toHaveLength(1);
  });
});
