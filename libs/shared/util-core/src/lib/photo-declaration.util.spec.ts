import { describe, expect, it } from 'vitest';

import { PrivacyUsage } from '@okr/shared-models';

import { getPhotoUsageName, hasPhotoRestriction, objectsToPhotos, photoUsageMatches, PHOTO_USAGE_ALL } from './photo-declaration.util';

describe('photo-declaration.util', () => {
  describe('getPhotoUsageName', () => {
    it('maps each tier to its category item name', () => {
      expect(getPhotoUsageName(PrivacyUsage.Public)).toBe('public');
      expect(getPhotoUsageName(PrivacyUsage.Restricted)).toBe('restricted');
      expect(getPhotoUsageName(PrivacyUsage.Protected)).toBe('protected');
    });

    // legacy person documents have no usageImages at all — Firestore reads skip model defaults
    it('treats a missing declaration as public', () => {
      expect(getPhotoUsageName(undefined)).toBe('public');
    });
  });

  describe('hasPhotoRestriction', () => {
    it('is false for public and for a missing declaration', () => {
      expect(hasPhotoRestriction(PrivacyUsage.Public)).toBe(false);
      expect(hasPhotoRestriction(undefined)).toBe(false);
    });

    it('is true for both restricted and protected', () => {
      expect(hasPhotoRestriction(PrivacyUsage.Restricted)).toBe(true);
      expect(hasPhotoRestriction(PrivacyUsage.Protected)).toBe(true);
    });
  });

  describe('objectsToPhotos', () => {
    it('is true only for protected — restricted still allows internal use', () => {
      expect(objectsToPhotos(PrivacyUsage.Protected)).toBe(true);
      expect(objectsToPhotos(PrivacyUsage.Restricted)).toBe(false);
      expect(objectsToPhotos(PrivacyUsage.Public)).toBe(false);
      expect(objectsToPhotos(undefined)).toBe(false);
    });
  });

  describe('photoUsageMatches', () => {
    it('passes everything for "all" and for an empty selection', () => {
      expect(photoUsageMatches(PrivacyUsage.Protected, PHOTO_USAGE_ALL)).toBe(true);
      expect(photoUsageMatches(PrivacyUsage.Public, '')).toBe(true);
    });

    it('matches on the selected tier', () => {
      expect(photoUsageMatches(PrivacyUsage.Protected, 'protected')).toBe(true);
      expect(photoUsageMatches(PrivacyUsage.Restricted, 'protected')).toBe(false);
    });

    it('lets a person with no declaration match the public filter', () => {
      expect(photoUsageMatches(undefined, 'public')).toBe(true);
      expect(photoUsageMatches(undefined, 'protected')).toBe(false);
    });
  });
});
