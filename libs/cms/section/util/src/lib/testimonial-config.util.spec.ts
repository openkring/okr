import { describe, expect, it } from 'vitest';

import { TestimonialEntry } from '@okr/shared-models';
import {
  parseTestimonials, stringifyTestimonials, testimonialColumns, validTestimonials, withTestimonialDefaults
} from './testimonial-config.util';

const entry = (over: Partial<TestimonialEntry> = {}): TestimonialEntry => ({
  quote: 'Grossartig.', authorName: 'Anna Muster', authorRole: '', imageUrl: '', detail: '', link: '', ...over
});

describe('withTestimonialDefaults', () => {
  it('fills the defaults for a legacy document', () => {
    expect(withTestimonialDefaults(undefined)).toEqual({ entries: [], layout: 'grid', columns: 3 });
  });

  it('keeps the configured values', () => {
    const config = { entries: [entry()], layout: 'carousel' as const, columns: 2 };
    expect(withTestimonialDefaults(config)).toEqual(config);
  });
});

describe('validTestimonials', () => {
  it('drops entries without a quote or an author', () => {
    const entries = [entry(), entry({ quote: '  ' }), entry({ authorName: '' })];
    expect(validTestimonials(entries)).toHaveLength(1);
  });

  it('coalesces the optional fields of a legacy entry', () => {
    const legacy = { quote: 'Toll.', authorName: 'Bea' } as TestimonialEntry;
    expect(validTestimonials([legacy])[0]).toEqual(
      { quote: 'Toll.', authorName: 'Bea', authorRole: '', imageUrl: '', detail: '', link: '' });
  });

  it('returns an empty list for undefined', () => {
    expect(validTestimonials(undefined)).toEqual([]);
  });
});

describe('testimonialColumns', () => {
  it('keeps a valid column count', () => {
    expect(testimonialColumns(1)).toBe(1);
    expect(testimonialColumns(4)).toBe(4);
  });

  it('clamps out-of-range, fractional and missing values', () => {
    expect(testimonialColumns(0)).toBe(1);
    expect(testimonialColumns(99)).toBe(4);
    expect(testimonialColumns(2.4)).toBe(2);
    expect(testimonialColumns(undefined)).toBe(3);
    expect(testimonialColumns(NaN)).toBe(3);
  });
});

describe('parse/stringify', () => {
  it('round-trips the entries', () => {
    const entries = [entry({ link: 'https://example.org' })];
    expect(parseTestimonials(stringifyTestimonials(entries))).toEqual(entries);
  });

  it('returns undefined for broken JSON or a non-array', () => {
    expect(parseTestimonials('{')).toBeUndefined();
    expect(parseTestimonials('{"quote":"x"}')).toBeUndefined();
  });

  it('renders an empty list as an empty editor', () => {
    expect(stringifyTestimonials([])).toBe('');
  });
});
