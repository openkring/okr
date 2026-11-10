import { describe, expect, it } from 'vitest';

import { TILES_SECTION_SHAPE, TilesSection } from '@okr/shared-models';
import { tilesSectionValidations } from './tiles-section.validations';

const model = (props: Partial<TilesSection['properties']>): TilesSection =>
  ({ ...TILES_SECTION_SHAPE, properties: { ...TILES_SECTION_SHAPE.properties, ...props } }) as TilesSection;

describe('tilesSectionValidations', () => {
  it('accepts the default shape', () => {
    expect(tilesSectionValidations(model({})).hasErrors('tiles.columns')).toBe(false);
  });

  it('flags columns outside 1-4', () => {
    expect(tilesSectionValidations(model({ columns: 0 })).hasErrors('tiles.columns')).toBe(true);
    expect(tilesSectionValidations(model({ columns: 5 })).hasErrors('tiles.columns')).toBe(true);
    expect(tilesSectionValidations(model({ columns: 4 })).hasErrors('tiles.columns')).toBe(false);
  });

  it('requires value on a stat tile', () => {
    const r = tilesSectionValidations(model({ variant: 'stat', items: [{ tone: 'primary', title: 'x' }] }));
    expect(r.hasErrors('tiles.i0.value')).toBe(true);
  });

  it('requires title on a card tile', () => {
    const r = tilesSectionValidations(model({ variant: 'card', items: [{ tone: 'primary', value: '1' }] }));
    expect(r.hasErrors('tiles.i0.title')).toBe(true);
  });

  it('checks the url only when set', () => {
    const ok = tilesSectionValidations(model({ items: [{ tone: 'primary', title: 'a', url: '' }, { tone: 'primary', title: 'b', url: 'bootshaus.html' }] }));
    expect(ok.hasErrors('tiles.i0.url')).toBe(false);
    expect(ok.hasErrors('tiles.i1.url')).toBe(false);
    const bad = tilesSectionValidations(model({ items: [{ tone: 'primary', title: 'a', url: 'javascript:x' }] }));
    expect(bad.hasErrors('tiles.i0.url')).toBe(true);
  });

  it('does not flag a config without columns (legacy doc)', () => {
    const m = model({});
    delete (m.properties as { columns?: number }).columns;
    expect(tilesSectionValidations(m).hasErrors('tiles.columns')).toBe(false);
  });

  it('ignores a whitespace-only url', () => {
    expect(tilesSectionValidations(model({ items: [{ tone: 'primary', title: 'a', url: '  ' }] })).hasErrors('tiles.i0.url')).toBe(false);
  });

  it('does not require a title on a stat tile', () => {
    expect(tilesSectionValidations(model({ variant: 'stat', items: [{ tone: 'primary', value: '1917' }] })).hasErrors('tiles.i0.title')).toBe(false);
  });
});
