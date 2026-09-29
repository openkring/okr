import { describe, expect, it } from 'vitest';
import { DEFAULT_JASS_CONFIG } from './jass.config';
import { JassHandFormModel } from './jass-hand.form-model';
import { jassConfigValidations, jassHandValidations } from './jass.validations';

const base: JassHandFormModel = {
  variant: 'schieber', sideIds: ['a', 'b'], trumpOptions: [], phase: 'full', multiplier: 1,
  trump: '', sideId: '', points: [100, 57], weis: [0, 0], match: '', announced: [],
};

describe('jassHandValidations', () => {
  it('passes a valid hand', () => expect(jassHandValidations(base).isValid()).toBe(true));
  it('flags the points sum under "points"', () => {
    expect(jassHandValidations({ ...base, points: [100, 50] }).getErrors('points')).toHaveLength(1);
  });
  it('skips the sum for a Match', () => {
    expect(jassHandValidations({ ...base, points: [0, 0], match: 'a' }).isValid()).toBe(true);
  });
  it('flags a multiplier outside 1..5', () => {
    expect(jassHandValidations({ ...base, multiplier: 6 }).getErrors('multiplier')).toHaveLength(1);
    expect(jassHandValidations({ ...base, multiplier: 5 }).isValid()).toBe(true);
  });
  it('Coiffeur: flags a missing row, and ignores the multiplier', () => {
    const c: JassHandFormModel = { ...base, variant: 'coiffeur', trumpOptions: ['eicheln'], sideId: 'a', multiplier: 0 };
    expect(jassHandValidations({ ...c, trump: '' }).getErrors('trump')).toHaveLength(1);
    expect(jassHandValidations({ ...c, trump: 'eicheln' }).isValid()).toBe(true);
  });
  it('flags invalid Weis in Coiffeur only (Schieber and Büter chalk Weis on the slate)', () => {
    const c: JassHandFormModel = { ...base, variant: 'coiffeur', trumpOptions: ['eicheln'], trump: 'eicheln', sideId: 'a' };
    expect(jassHandValidations({ ...c, weis: [25, 0] }).getErrors('weis')).toHaveLength(1);
    expect(jassHandValidations({ ...base, weis: [25, 0] }).getErrors('weis')).toHaveLength(0);
  });
  it('Differenzler: accepts 257/0/0 as a Match only', () => {
    const d: JassHandFormModel = { ...base, variant: 'differenzler', sideIds: ['p0', 'p1', 'p2'], trump: 'eicheln',
      points: [0, 0, 0], announced: [50, 50, 57], match: 'p1', weis: [0, 0, 0] };
    expect(jassHandValidations(d).isValid()).toBe(true);
    expect(jassHandValidations({ ...d, match: '', points: [0, 157, 1] }).getErrors('points')).toHaveLength(1);
  });
  it('Differenzler announce step validates only the announcements', () => {
    const d: JassHandFormModel = { ...base, variant: 'differenzler', phase: 'announce', sideIds: ['p0', 'p1', 'p2'],
      points: [0, 0, 0], announced: [50, 158, 57], weis: [0, 0, 0] };
    expect(jassHandValidations(d).getErrors('announced')).toHaveLength(1);
    expect(jassHandValidations(d).getErrors('points')).toHaveLength(0);
  });
});

describe('jassConfigValidations', () => {
  it('passes the defaults', () => expect(jassConfigValidations(DEFAULT_JASS_CONFIG).isValid()).toBe(true));
  it('flags a target under 100 and zero Differenzler hands', () => {
    expect(jassConfigValidations({ ...DEFAULT_JASS_CONFIG, schieberTarget: 50 }).getErrors('schieberTarget')).toHaveLength(1);
    expect(jassConfigValidations({ ...DEFAULT_JASS_CONFIG, differenzlerHands: 0 }).getErrors('differenzlerHands')).toHaveLength(1);
  });
  it('flags a row with an empty label or multiplier 0', () => {
    const rows = [{ id: 'x', label: '', multiplier: 1 }, { id: 'y', label: 'Y', multiplier: 0 }];
    expect(jassConfigValidations({ ...DEFAULT_JASS_CONFIG, coiffeurRows: rows }).getErrors('coiffeurRows')).toHaveLength(1);
  });
});
