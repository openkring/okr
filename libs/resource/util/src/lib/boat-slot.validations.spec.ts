import { describe, expect, it } from 'vitest';
import { BoatSlotLabel } from '@okr/shared-models';

import { isEmptyBoatSlot } from './boat-slot.validations';

describe('isEmptyBoatSlot', () => {
  const label = (patch: Partial<BoatSlotLabel>): BoatSlotLabel => ({ ...new BoatSlotLabel(), color: 'none', ...patch });

  it('is empty without a note, a background or a strategy entry', () => {
    expect(isEmptyBoatSlot(undefined)).toBe(true);
    expect(isEmptyBoatSlot(label({}))).toBe(true);
    expect(isEmptyBoatSlot(label({ color: '' }))).toBe(true);
  });

  it('keeps a textless boat label that is flagged for the strategy', () => {
    expect(isEmptyBoatSlot(label({ isStrategyRelevant: true, price: 12000 }))).toBe(false);
  });

  it('keeps a label that only carries a background', () => {
    expect(isEmptyBoatSlot(label({ color: 'success' }))).toBe(false);
  });

  it('keeps a label that only carries a note', () => {
    expect(isEmptyBoatSlot(label({ text: 'NEU' }))).toBe(false);
  });
});
