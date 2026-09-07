import { describe, expect, it } from 'vitest';

import { FolderModel } from '@okr/shared-models';

import {
  derivePublicFolderKey, hasPublicFolderTag, isFolderPublished, isPublicFolderKey, setFolderPublicTag
} from './folder.util';

/**
 * These MIRROR isPublicFolder() in apps/functions/src/publicApi/routes/gallery.ts, which is the
 * actual gate. If a case here disagrees with gallery.spec.ts, the app is lying to the user about
 * what is published — keep the two suites in step.
 */
describe('isPublicFolderKey', () => {
  it('accepts a key ending in the suffix', () => {
    expect(isPublicFolderKey('p13_2024-public')).toBe(true);
  });

  it('rejects the suffix anywhere but the end', () => {
    expect(isPublicFolderKey('p13_public-archive')).toBe(false);
    expect(isPublicFolderKey('p13_2024')).toBe(false);
    expect(isPublicFolderKey('')).toBe(false);
  });
});

describe('hasPublicFolderTag', () => {
  it('finds the exact tag among others', () => {
    expect(hasPublicFolderTag('@tag.photo,public')).toBe(true);
    expect(hasPublicFolderTag(' public , @tag.x ')).toBe(true);
  });

  it('does not accept a tag that merely contains the word', () => {
    expect(hasPublicFolderTag('publications')).toBe(false);
    expect(hasPublicFolderTag('not-public')).toBe(false);
    expect(hasPublicFolderTag('')).toBe(false);
  });
});

describe('isFolderPublished', () => {
  const folder = (okey: string, tags: string) => ({ okey, tags } as FolderModel);

  it('requires both gates', () => {
    expect(isFolderPublished(folder('p13_2024-public', 'public'))).toBe(true);
    expect(isFolderPublished(folder('p13_2024-public', '@tag.photo'))).toBe(false);
    expect(isFolderPublished(folder('p13_2024', 'public'))).toBe(false);
    expect(isFolderPublished(folder('p13_2024', ''))).toBe(false);
  });
});

describe('derivePublicFolderKey', () => {
  it('builds <tenant>_<slug>-public', () => {
    expect(derivePublicFolderKey('p13', '2024')).toBe('p13_2024-public');
  });

  it('slugifies accents, spaces and punctuation, and lowercases', () => {
    expect(derivePublicFolderKey('bka', 'Zürichsee Frühling')).toBe('bka_zurichsee-fruhling-public');
    expect(derivePublicFolderKey('bka', 'Berner  Oberland!')).toBe('bka_berner-oberland-public');
  });

  it('never produces a bare suffix for an unusable name', () => {
    expect(derivePublicFolderKey('bka', '???')).toBe('bka_file-public');
  });
});

describe('setFolderPublicTag', () => {
  it('adds the tag, keeping the others', () => {
    expect(setFolderPublicTag('@tag.photo,@tag.x', true)).toBe('@tag.photo,@tag.x,public');
  });

  it('removes the tag, keeping the others', () => {
    expect(setFolderPublicTag('@tag.photo,public,@tag.x', false)).toBe('@tag.photo,@tag.x');
  });

  it('is idempotent in both directions', () => {
    expect(setFolderPublicTag('public', true)).toBe('public');
    expect(setFolderPublicTag('', false)).toBe('');
  });

  it('normalises whitespace and empty entries', () => {
    expect(setFolderPublicTag(' @tag.photo , , public ', true)).toBe('@tag.photo,public');
  });
});
