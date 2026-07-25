import { describe, expect, it } from 'vitest';
import { AvailableLanguages } from '@okr/shared-models';
import { Languages } from './language';

describe('Languages category array', () => {
  it('abbreviations match AvailableLanguages exactly, in the same order', () => {
    expect(Languages.map((l) => l.abbreviation)).toEqual(AvailableLanguages);
  });
});
