import { describe, expect, it } from 'vitest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { WhiteboardItem } from '@okr/shared-models';

import { whiteboardItemValidations } from './whiteboard-item.validations';

function item(overrides: Partial<WhiteboardItem> = {}): WhiteboardItem {
  return { key: 'a1', kind: 'sticker', text: '', x: 0, y: 0, w: 160, h: 120, color: '', ownerKey: '', ...overrides };
}

describe('whiteboardItemValidations', () => {
  it('accepts an empty sticker with the theme-default colour', () => {
    expect(whiteboardItemValidations(item()).isValid()).toBe(true);
  });

  it('accepts text up to the description cap', () => {
    expect(whiteboardItemValidations(item({ text: 'x'.repeat(DESCRIPTION_LENGTH) })).isValid()).toBe(true);
  });

  it('rejects text over the description cap, filed under text', () => {
    const result = whiteboardItemValidations(item({ text: 'x'.repeat(DESCRIPTION_LENGTH + 1) }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('text').length).toBeGreaterThan(0);
  });

  it('does not cap the picker colour', () => {
    expect(whiteboardItemValidations(item({ color: '#fff4b8' })).isValid()).toBe(true);
  });

  it('rejects a missing text (legacy item without the field)', () => {
    const legacy = { ...item(), text: undefined } as unknown as WhiteboardItem;
    expect(whiteboardItemValidations(legacy).getErrors('text').length).toBeGreaterThan(0);
  });
});
