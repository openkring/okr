import { describe, expect, it } from 'vitest';

import {
  ambiguousTaskNotes, AMBIGUOUS_TASK_NAME, decideMatch, NAME_DIFFERS_TASK_NAME, nameDiffersTaskNotes, normalizeEmail,
  sameName, subscriberTaskId,
} from './subscriber.logic';

const anna = { personKey: 'p1', isFavorite: false, firstName: 'Anna', lastName: 'Muster' };
const typed = { firstName: 'Anna', lastName: 'Muster' };

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Anna@Example.CH ')).toBe('anna@example.ch');
  });
});

describe('decideMatch', () => {
  it('no candidates → create', () => {
    expect(decideMatch([], typed)).toEqual({ kind: 'create' });
  });

  it('one candidate with the same name → existing, name does not differ', () => {
    expect(decideMatch([anna], typed)).toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
  });

  it('compares names ignoring case and whitespace', () => {
    expect(decideMatch([anna], { firstName: ' anna ', lastName: 'MUSTER' }))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
    expect(decideMatch([{ ...anna, firstName: 'Anna Maria' }], { firstName: 'anna  maria', lastName: 'muster' }))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
  });

  it('one candidate with another name → existing, name differs', () => {
    expect(decideMatch([anna], { firstName: 'Anne', lastName: 'Muster' }))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: true });
  });

  it('two persons, one where the email is the favourite → that one', () => {
    const bea = { personKey: 'p2', isFavorite: true, firstName: 'Bea', lastName: 'Muster' };
    expect(decideMatch([anna, bea], typed)).toEqual({ kind: 'existing', personKey: 'p2', nameDiffers: true });
  });

  it('two persons without a favourite → ambiguous', () => {
    const bea = { personKey: 'p2', isFavorite: false, firstName: 'Bea', lastName: 'Muster' };
    expect(decideMatch([anna, bea], typed)).toEqual({ kind: 'ambiguous', personKeys: ['p1', 'p2'] });
  });

  it('two persons both with the email as favourite → ambiguous', () => {
    const a = { ...anna, isFavorite: true };
    const bea = { personKey: 'p2', isFavorite: true, firstName: 'Bea', lastName: 'Muster' };
    expect(decideMatch([a, bea], typed)).toEqual({ kind: 'ambiguous', personKeys: ['p1', 'p2'] });
  });

  it('two addresses of one person count once', () => {
    expect(decideMatch([anna, { ...anna, isFavorite: true }], typed))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
    expect(decideMatch([anna, anna], { firstName: 'Anne', lastName: 'Muster' }))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: true });
  });

  it('a person with two addresses (one favourite) still wins against a person without a favourite', () => {
    const bea = { personKey: 'p2', isFavorite: false, firstName: 'Bea', lastName: 'Muster' };
    expect(decideMatch([anna, bea, { ...anna, isFavorite: true }], typed))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
  });
});

describe('sameName', () => {
  it('ignores case and whitespace', () => {
    expect(sameName({ firstName: 'Anna', lastName: 'van Muster' }, { firstName: 'ANNA ', lastName: 'vanmuster' })).toBe(true);
    expect(sameName({ firstName: 'Anna', lastName: 'Muster' }, { firstName: 'Anna', lastName: 'Meier' })).toBe(false);
  });
});

describe('task texts', () => {
  it('name-differs task: fixed title, both names and the newsletter — no address', () => {
    expect(NAME_DIFFERS_TASK_NAME).toBe('Newsletter-Anmeldung: Name weicht ab');
    expect(nameDiffersTaskNotes('Anne Muster', 'Anna Muster', 'Dorfnews')).toBe(
      'Bei der Anmeldung zum Newsletter Dorfnews wurde der Name «Anne Muster» eingegeben.\n'
      + 'Die Person mit dieser E-Mail-Adresse heisst «Anna Muster».\n'
      + 'Prüfe, ob der Name angepasst werden soll. Die Anmeldung gilt für die bestehende Person.',
    );
  });

  it('ambiguous task: fixed title, the candidates by name only', () => {
    expect(AMBIGUOUS_TASK_NAME).toBe('Newsletter-Anmeldung zuordnen');
    expect(ambiguousTaskNotes('Anna Muster', ['Anna Muster', 'Bea Muster'], 'Dorfnews')).toBe(
      'Bei der Anmeldung zum Newsletter Dorfnews wurde der Name «Anna Muster» eingegeben.\n'
      + 'Mehrere Personen haben diese E-Mail-Adresse: Anna Muster, Bea Muster.\n'
      + 'Ordne die Anmeldung von Hand der richtigen Person zu.',
    );
  });
});

describe('subscriberTaskId', () => {
  const id = subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a1' });

  it('is deterministic and does not contain the email', () => {
    expect(id).toBe(subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a1' }));
    expect(id).toMatch(/^newsletter-[0-9a-f]{32}$/);
    expect(id).not.toContain('anna');
  });

  it('differs per kind, admin, group, tenant and email', () => {
    const others = [
      subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'anna@example.ch', kind: 'ambiguous', adminKey: 'a1' }),
      subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a2' }),
      subscriberTaskId({ tenantId: 't', groupKey: 'h', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a1' }),
      subscriberTaskId({ tenantId: 'u', groupKey: 'g', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a1' }),
      subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'bea@example.ch', kind: 'nameDiffers', adminKey: 'a1' }),
    ];
    expect(new Set([id, ...others]).size).toBe(6);
  });
});
