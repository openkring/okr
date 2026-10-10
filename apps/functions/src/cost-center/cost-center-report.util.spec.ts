import { describe, expect, it } from 'vitest';

import { isPersonRelated, isResponsible, projectBooking, visibleCostCenterKeys } from './cost-center-report.util';

const TODAY = '20261010';
const resp = (extra: Record<string, unknown> = {}) => ({
  okey: 'r1', isArchived: false, validFrom: '20250101', validTo: '99991231',
  responsibleAvatar: { key: 'p1', modelType: 'person' }, ...extra,
});

describe('isResponsible', () => {
  it('names the responsible person', () => {
    expect(isResponsible(resp(), 'p1', new Set(), TODAY)).toBe(true);
    expect(isResponsible(resp(), 'p2', new Set(), TODAY)).toBe(false);
  });
  it('a group avatar qualifies its current members', () => {
    const r = resp({ responsibleAvatar: { key: 'g1', modelType: 'group' } });
    expect(isResponsible(r, 'p2', new Set(['g1']), TODAY)).toBe(true);
    expect(isResponsible(r, 'p2', new Set(), TODAY)).toBe(false);
  });
  it('the delegate counts only inside the delegation window', () => {
    const active = resp({ delegateAvatar: { key: 'p9', modelType: 'person' }, delegateValidFrom: '20261001', delegateValidTo: '20261031' });
    const ended = resp({ delegateAvatar: { key: 'p9', modelType: 'person' }, delegateValidFrom: '20260101', delegateValidTo: '20260131' });
    expect(isResponsible(active, 'p9', new Set(), TODAY)).toBe(true);
    expect(isResponsible(ended, 'p9', new Set(), TODAY)).toBe(false);
  });
  it('an archived or out-of-date responsibility grants nothing', () => {
    expect(isResponsible(resp({ isArchived: true }), 'p1', new Set(), TODAY)).toBe(false);
    expect(isResponsible(resp({ validTo: '20251231' }), 'p1', new Set(), TODAY)).toBe(false);
    expect(isResponsible(resp({ validFrom: '20270101' }), 'p1', new Set(), TODAY)).toBe(false);
  });
  it('an empty person key matches nobody', () => {
    expect(isResponsible(resp({ responsibleAvatar: { key: '', modelType: 'person' } }), '', new Set(), TODAY)).toBe(false);
  });
});

describe('visibleCostCenterKeys', () => {
  const centers = [
    { okey: 'sport', parentKey: '', responsibilityKey: 'rSport' },
    { okey: 'jun', parentKey: 'sport', responsibilityKey: '' },
    { okey: 'reg', parentKey: 'sport', responsibilityKey: 'rReg' },
    { okey: 'adm', parentKey: '', responsibilityKey: 'rAdm' },
    { okey: 'old', parentKey: 'sport', responsibilityKey: '', isArchived: true },
  ];
  const resps = new Map([
    ['rSport', resp({ okey: 'rSport', responsibleAvatar: { key: 'pS', modelType: 'person' } })],
    ['rReg', resp({ okey: 'rReg', responsibleAvatar: { key: 'pR', modelType: 'person' } })],
    ['rAdm', resp({ okey: 'rAdm', responsibleAvatar: { key: 'pA', modelType: 'person' } })],
  ]);
  it('inherits down the tree: a group responsibility covers every live descendant', () => {
    expect([...visibleCostCenterKeys(centers, resps, 'pS', new Set(), TODAY)].sort()).toEqual(['jun', 'reg', 'sport']);
  });
  it('a leaf responsibility covers only that leaf', () => {
    expect([...visibleCostCenterKeys(centers, resps, 'pR', new Set(), TODAY)]).toEqual(['reg']);
  });
  it('nobody else sees anything', () => {
    expect(visibleCostCenterKeys(centers, resps, 'pX', new Set(), TODAY).size).toBe(0);
  });
});

describe('isPersonRelated', () => {
  const none = new Set<string>();
  it('expense, anonymized and person counterparties are person-related', () => {
    expect(isPersonRelated({ okey: 'e1' }, new Set(['e1']))).toBe(true);
    expect(isPersonRelated({ okey: 'b', anonymizedAt: '20260101' }, none)).toBe(true);
    expect(isPersonRelated({ okey: 'b', counterparty: { key: 'p1', modelType: 'person' } }, none)).toBe(true);
  });
  it('a counterparty without a record key (bank payee text) is person-related (D22)', () => {
    expect(isPersonRelated({ okey: 'bank-x', counterparty: { key: '', modelType: 'org' } }, none)).toBe(true);
  });
  it('a resolved org and a booking without counterparty are not', () => {
    expect(isPersonRelated({ okey: 'b', counterparty: { key: 'o1', modelType: 'org' } }, none)).toBe(false);
    expect(isPersonRelated({ okey: 'b' }, none)).toBe(false);
  });
});

describe('projectBooking', () => {
  const b = { okey: 'b1', date: '20260512', bookingNo: 7, title: 'Meldegelder Sarnen', notes: 'raw bank text Anna Muster',
    counterparty: { key: 'o1', modelType: 'org', name1: '', name2: 'Ruderclub Sarnen', label: 'RC Sarnen' } };
  it('unmasked: title and the counterparty label, never its key or notes', () => {
    const r = projectBooking(b, false);
    expect(r).toEqual({ okey: 'b1', date: '20260512', bookingNo: 7, title: 'Meldegelder Sarnen', counterpartyName: 'RC Sarnen', masked: false });
    expect(JSON.stringify(r)).not.toContain('o1');
    expect(JSON.stringify(r)).not.toContain('Anna');
  });
  it('masked: no title and no counterparty', () => {
    expect(projectBooking(b, true)).toEqual({ okey: 'b1', date: '20260512', bookingNo: 7, title: '', counterpartyName: '', masked: true });
  });
  it('falls back to name1 name2 when the counterparty has no label', () => {
    expect(projectBooking({ okey: 'b2', counterparty: { key: 'o2', modelType: 'org', name1: '', name2: 'Swisslos', label: '' } }, false).counterpartyName).toBe('Swisslos');
  });
});
