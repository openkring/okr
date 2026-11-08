import { describe, expect, it } from 'vitest';
import { addsMenuRows, entriesOfKind, isEmptyPlan, type ApplyPlanPreview } from './apply-preview.types';

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

describe('addsMenuRows', () => {
  const plan = (...kinds: ApplyPlanPreview['entries'][number]['kind'][]): ApplyPlanPreview => ({
    entries: kinds.map(kind => ({ kind, subject: 'x', consequence: '' })), alsoEnabled: [], withheld: [],
  });

  it('is true as soon as one menu row is created, shared, reactivated or attached', () => {
    expect(addsMenuRows(plan('menu-created'))).toBe(true);
    expect(addsMenuRows(plan('block-enabled', 'menu-extended'))).toBe(true);
    expect(addsMenuRows(plan('menu-reactivated'))).toBe(true);
    expect(addsMenuRows(plan('menu-attached'))).toBe(true);
  });

  it('is false for a plan without menu rows', () => {
    expect(addsMenuRows(plan())).toBe(false);
    expect(addsMenuRows(plan('block-enabled', 'seed-created', 'field-pinned'))).toBe(false);
  });
});
