import { describe, expect, it } from 'vitest';

import { FORM_MAPPINGS as SHARED } from '@okr/forms-util';

import { FORM_MAPPINGS as INLINED } from './index';

/**
 * The FormMapping whitelist exists twice on purpose: the client copy feeds the form-builder's
 * target picker, the inlined server copy is the security boundary (a submit may only write a
 * collection that appears there). Nothing links them — a one-sided edit type-checks, builds,
 * and then fails at submit time with 'Unknown mapping'.
 */
describe('FORM_MAPPINGS mirror', () => {
  it('has the same mapping keys on both sides', () => {
    expect(INLINED.map(m => m.mappingKey).sort()).toEqual(SHARED.map(m => m.mappingKey).sort());
  });

  it('agrees on the target collection of every mapping', () => {
    for (const shared of SHARED) {
      const inlined = INLINED.find(m => m.mappingKey === shared.mappingKey);
      expect(inlined?.collectionName, `collection of ${shared.mappingKey}`).toBe(shared.collectionName);
      expect(inlined?.modelType, `modelType of ${shared.mappingKey}`).toBe(shared.modelType);
    }
  });

  it('agrees on the defaults, which the server applies over the submitted values', () => {
    for (const shared of SHARED) {
      const inlined = INLINED.find(m => m.mappingKey === shared.mappingKey);
      expect(inlined?.defaults ?? {}, `defaults of ${shared.mappingKey}`).toEqual(shared.defaults ?? {});
    }
  });
});
