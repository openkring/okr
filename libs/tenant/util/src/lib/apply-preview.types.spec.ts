import { describe, expect, it } from 'vitest';
import { entriesOfKind, isEmptyPlan, type ApplyPlanPreview } from './apply-preview.types';

const empty: ApplyPlanPreview = { entries: [], alsoEnabled: [], withheld: [] };

describe('ApplyPlanPreview', () => {
  it('is empty when it has no entries', () => {
    expect(isEmptyPlan(empty)).toBe(true);
  });

  it('is not empty when a block is withheld, even without entries', () => {
    expect(isEmptyPlan({ ...empty, withheld: [{ id: 'esign', reason: 'internal' }] }))
      .toBe(false);
  });

  it('filters entries by kind', () => {
    const preview: ApplyPlanPreview = {
      ...empty,
      entries: [
        { kind: 'menu-created', subject: 'calevent-all', consequence: 'wird neu angelegt' },
        { kind: 'block-enabled', subject: 'calevent', consequence: 'wird eingeschaltet' },
      ],
    };
    expect(entriesOfKind(preview, 'menu-created').map(e => e.subject)).toEqual(['calevent-all']);
  });
});
