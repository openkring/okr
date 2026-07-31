import { describe, expect, it } from 'vitest';
import { create } from 'vest';

import { partialDateValidations, tagValidations } from './vest.util';

/**
 * The configured tag lists in the `tags` collection are authored with ", " separators
 * (e.g. "@tag.advertiser, @tag.bexio, @tag.business"), while a model's own `tags` field is
 * written without them ("@tag.bexio,@tag.sponsor"). tagValidations compares the two by exact
 * string match, so an untrimmed split made every configured tag but the first unmatchable —
 * silently invalidating the whole form of any tagged person, org or document.
 */
function runTags(tags: string, givenTags: string) {
  const suite = create(() => tagValidations('tags', tags, givenTags));
  return suite();
}

const CONFIGURED = '@tag.advertiser, @tag.bexio, @tag.business, @tag.family, @tag.friend, @tag.important';

describe('tagValidations', () => {

  it('accepts tags stored without separator spaces against a spaced tag list', () => {
    const result = runTags('@tag.bexio,@tag.sponsor'.replace('@tag.sponsor', '@tag.family'), CONFIGURED);
    expect(result.getErrors()).toEqual({});
    expect(result.isValid()).toBe(true);
  });

  it('accepts tags stored with separator spaces', () => {
    const result = runTags('@tag.bexio, @tag.family', CONFIGURED);
    expect(result.getErrors()).toEqual({});
    expect(result.isValid()).toBe(true);
  });

  it('accepts the first configured tag (the only one that ever matched)', () => {
    expect(runTags('@tag.advertiser', CONFIGURED).isValid()).toBe(true);
  });

  it('accepts an empty tag list', () => {
    expect(runTags('', CONFIGURED).isValid()).toBe(true);
  });

  it('still rejects a tag that is not configured', () => {
    const result = runTags('@tag.bexio,@tag.doesnotexist', CONFIGURED);
    expect(result.getErrors()).toHaveProperty('tags[1]');
    expect(result.isValid()).toBe(false);
  });
});

function runPartialDate(date: string) {
  const suite = create(() => partialDateValidations('dateOfBirth', date));
  return suite();
}

describe('partialDateValidations', () => {
  it('accepts a full date', () => {
    expect(runPartialDate('19850415').hasErrors('dateOfBirth')).toBe(false);
  });

  it('accepts a year-only date', () => {
    expect(runPartialDate('19850000').hasErrors('dateOfBirth')).toBe(false);
  });

  it('accepts a birthday without a year', () => {
    expect(runPartialDate('00000415').hasErrors('dateOfBirth')).toBe(false);
  });

  it('accepts an empty value, since the field is optional', () => {
    expect(runPartialDate('').hasErrors('dateOfBirth')).toBe(false);
  });

  it('rejects an all-filler value', () => {
    expect(runPartialDate('00000000').hasErrors('dateOfBirth')).toBe(true);
  });

  it('rejects a date that is not a real calendar date', () => {
    expect(runPartialDate('19850229').hasErrors('dateOfBirth')).toBe(true);
  });

  it('rejects a wrong length', () => {
    expect(runPartialDate('1985').hasErrors('dateOfBirth')).toBe(true);
  });
});
