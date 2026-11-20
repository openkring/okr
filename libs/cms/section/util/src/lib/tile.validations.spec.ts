import { describe, expect, it } from 'vitest';

import { TileItem } from '@okr/shared-models';
import { TILE_LINK_LABEL_LENGTH, tileValidations } from './tile.validations';

const tile = (t: Partial<TileItem>): TileItem => ({ tone: 'primary', ...t });

describe('tileValidations', () => {
  it('requires the value of a stat tile, not its title', () => {
    const r = tileValidations(tile({ title: 'x' }), 'stat');
    expect(r.hasErrors('value')).toBe(true);
    expect(r.hasErrors('title')).toBe(false);
  });

  it('requires the title of a card, not its value', () => {
    const r = tileValidations(tile({ value: '1' }), 'card');
    expect(r.hasErrors('title')).toBe(true);
    expect(r.hasErrors('value')).toBe(false);
  });

  it('accepts a complete card with icon, link text and url', () => {
    const r = tileValidations(tile({ title: 'Kurse', icon: 'rowing_2x_side_front', linkLabel: 'Los geht\'s', url: 'seite.html?key=x' }), 'card');
    expect(r.hasErrors()).toBe(false);
  });

  it('checks the url only when set', () => {
    expect(tileValidations(tile({ title: 'a', url: '' }), 'card').hasErrors('url')).toBe(false);
    expect(tileValidations(tile({ title: 'a', url: 'javascript:x' }), 'card').hasErrors('url')).toBe(true);
  });

  it('caps the link text', () => {
    const r = tileValidations(tile({ title: 'a', linkLabel: 'x'.repeat(TILE_LINK_LABEL_LENGTH + 1) }), 'card');
    expect(r.hasErrors('linkLabel')).toBe(true);
  });

  it('treats a legacy tile without tone as primary', () => {
    expect(tileValidations({ title: 'a' } as TileItem, 'card').hasErrors('tone')).toBe(false);
  });
});

describe('tileValidations color', () => {
  it('accepts an empty or hex colour and flags anything else', () => {
    expect(tileValidations({ title: 'A', tone: 'primary', color: '' }, 'card').hasErrors('color')).toBe(false);
    expect(tileValidations({ title: 'A', tone: 'primary', color: '#59A3BF' }, 'card').hasErrors('color')).toBe(false);
    expect(tileValidations({ title: 'A', tone: 'primary', color: 'blue' }, 'card').hasErrors('color')).toBe(true);
  });
});
