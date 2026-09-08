import { describe, expect, it } from 'vitest';
import { create, staticSuite } from 'vest';

import { DeliveryChannel } from '@okr/shared-models';

import { deliveryChannelsValidations, imageUrlValidations, partialDateValidations, stringValidations, tagValidations, urlValidations } from './vest.util';

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

  it('skips the membership check when no configured list is passed (Signal Forms bridge)', () => {
    const suite = create(() => tagValidations('tags', '@tag.bexio', undefined));
    expect(suite().isValid()).toBe(true);
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

/**
 * The length cap used to ride on the `isMandatory` flag: `stringValidations(f, v, 50)` declared a
 * maximum and enforced nothing, in ~380 call sites including baseValidations' own `name` and
 * `index`. These pin the cap to the cap, and the exemption to values there is nothing to measure.
 */
function runString(value: unknown, maxLength?: number, minLength = 0, isMandatory = false) {
  return create(() => stringValidations('field', value, maxLength, minLength, isMandatory))();
}

describe('stringValidations — maxLength', () => {

  it('enforces the cap on an OPTIONAL field', () => {
    expect(runString('x'.repeat(51), 50).getErrors('field')).toContain('tooLong');
  });

  it('enforces the cap on a mandatory field', () => {
    expect(runString('x'.repeat(51), 50, 1, true).getErrors('field')).toContain('tooLong');
  });

  it('accepts a value of exactly the cap', () => {
    expect(runString('x'.repeat(50), 50).isValid()).toBe(true);
  });

  it('accepts an empty optional value — there is nothing to be too long', () => {
    const result = runString('', 50);
    expect(result.getErrors('field')).not.toContain('tooLong');
    expect(result.isValid()).toBe(true);
  });

  it('does not report tooLong for an absent optional value', () => {
    // shorterThanOrEquals(undefined) throws, and Vest records a throw as a failure — without the
    // guard every empty optional field in the app would have reported 'tooLong'.
    expect(runString(undefined, 50).getErrors('field')).not.toContain('tooLong');
    expect(runString(null, 50).getErrors('field')).not.toContain('tooLong');
  });

  it('checks nothing when no cap is declared', () => {
    expect(runString('x'.repeat(5000)).isValid()).toBe(true);
  });

  it('leaves minLength gated on isMandatory — an optional field may stay empty', () => {
    expect(runString('', 50, 5).getErrors('field')).not.toContain('tooShort');
    expect(runString('abc', 50, 5, true).getErrors('field')).toContain('tooShort');
  });
});

/**
 * An image url is rendered through imgix, and `checkUrlType` only recognises https / assets/ /
 * tenant… as renderable. urlValidations additionally accepts a leading '/' (navigation targets
 * need it) — on an image field that value passes the form and then renders as an empty image,
 * which is what SCS-A2 reported.
 */
function runImageUrl(url: string) {
  const suite = create(() => imageUrlValidations('url', url));
  return suite();
}

function runUrl(url: string) {
  const suite = create(() => urlValidations('url', url));
  return suite();
}

describe('imageUrlValidations', () => {

  it.each([
    'https://bkaiser.imgix.net/tenant/p13/logo/logo_round.svg',
    'https://example.com/photo.jpg',
    'assets/img/logo_square.png',
    'tenant/p13/logo/logo_round.svg',
  ])('accepts a renderable url: %s', (url) => {
    expect(runImageUrl(url).isValid()).toBe(true);
  });

  it('accepts an empty url (the field is optional)', () => {
    expect(runImageUrl('').isValid()).toBe(true);
  });

  it.each([
    '/private/album/c-contentpage',
    '/tenant/p13/logo/logo_round.svg',
  ])('rejects a leading slash, which checkUrlType reads as a key: %s', (url) => {
    expect(runImageUrl(url).isValid()).toBe(false);
  });

  it('rejects a bare document key', () => {
    expect(runImageUrl('logo/general/osi.svg').isValid()).toBe(false);
  });

  it('rejects "assets" without the separator, which checkUrlType reads as a key', () => {
    expect(runImageUrl('assetsimg/logo.png').isValid()).toBe(false);
  });

  it('rejects an insecure http url', () => {
    expect(runImageUrl('http://example.com/photo.jpg').isValid()).toBe(false);
  });

  it('is stricter than urlValidations, which still allows navigation targets', () => {
    expect(runUrl('/private/album/c-contentpage').isValid()).toBe(true);
    expect(runImageUrl('/private/album/c-contentpage').isValid()).toBe(false);
  });
});

describe('deliveryChannelsValidations', () => {
  const suite = staticSuite((value: unknown) => {
    deliveryChannelsValidations('newsDelivery', value);
  });

  it('accepts a non-empty list of known channels', () => {
    expect(suite([DeliveryChannel.Email, DeliveryChannel.Chat]).isValid()).toBe(true);
    expect(suite([DeliveryChannel.Post]).isValid()).toBe(true);
  });

  it('rejects an empty list — at least one way must stay selected', () => {
    expect(suite([]).isValid()).toBe(false);
  });

  it('rejects a non-list, including a legacy number', () => {
    expect(suite(1).isValid()).toBe(false);
    expect(suite(undefined).isValid()).toBe(false);
  });

  it('rejects an unknown channel and a duplicate', () => {
    expect(suite(['fax']).isValid()).toBe(false);
    expect(suite([DeliveryChannel.Email, DeliveryChannel.Email]).isValid()).toBe(false);
  });
});
