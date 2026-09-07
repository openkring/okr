import { describe, it, expect } from 'vitest';

import { isPublicFolder } from './gallery';

/**
 * This predicate IS the security boundary of an unauthenticated endpoint that reads a
 * collection also holding HR, finance and business documents. Both gates must be required.
 */
describe('isPublicFolder', () => {
  it('publishes a folder that passes both gates', () => {
    expect(isPublicFolder('bka_paris-public', '@tag.photo,public')).toBe(true);
  });

  it('refuses a tagged folder whose key lacks the suffix', () => {
    expect(isPublicFolder('bka_paris', 'public')).toBe(false);
  });

  it('refuses a suffixed folder that was never tagged', () => {
    expect(isPublicFolder('bka_paris-public', '@tag.photo')).toBe(false);
    expect(isPublicFolder('bka_paris-public', '')).toBe(false);
  });

  it('refuses a folder that passes neither gate', () => {
    expect(isPublicFolder('p13_2024', '@tag.important')).toBe(false);
  });

  it('does not accept a tag that merely contains "public"', () => {
    expect(isPublicFolder('bka_x-public', 'publications')).toBe(false);
    expect(isPublicFolder('bka_x-public', 'not-public')).toBe(false);
  });

  it('requires the suffix at the end of the key, not anywhere in it', () => {
    expect(isPublicFolder('bka_public-archive', 'public')).toBe(false);
  });
});
