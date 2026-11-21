import { describe, expect, it } from 'vitest';

import {
  decideMatch, DUPLICATES_TASK_NAME, duplicatesTaskNotes, NAME_DIFFERS_TASK_NAME, nameDiffersTaskNotes, normalizeEmail,
  sameName, SHARED_EMAIL_TASK_NAME, sharedEmailTaskNotes, subscriberTaskId,
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

  it('several persons, exactly one with the typed name → that one, even when another has the favourite', () => {
    const bea = { personKey: 'p2', isFavorite: true, firstName: 'Bea', lastName: 'Muster' };
    expect(decideMatch([anna, bea], typed)).toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
    expect(decideMatch([bea, anna], { firstName: ' anna', lastName: 'MUSTER ' }))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
  });

  it('several persons, none with the typed name → create (shared mailbox), naming the others', () => {
    const bea = { personKey: 'p2', isFavorite: true, firstName: 'Bea', lastName: 'Muster' };
    const carl = { personKey: 'p0', isFavorite: false, firstName: 'Carl', lastName: 'Muster' };
    expect(decideMatch([bea, carl], typed)).toEqual({ kind: 'create', sharedWith: ['p0', 'p2'] });
  });

  it('several persons with the typed name → the favourite one, possible duplicates', () => {
    const a3 = { ...anna, personKey: 'p3', isFavorite: true };
    const bea = { personKey: 'p2', isFavorite: false, firstName: 'Bea', lastName: 'Muster' };
    expect(decideMatch([anna, a3, bea], typed))
      .toEqual({ kind: 'existing', personKey: 'p3', nameDiffers: false, duplicateKeys: ['p1', 'p3'] });
  });

  it('several persons with the typed name and no single favourite → the lowest person key', () => {
    const a3 = { ...anna, personKey: 'p3' };
    const a0 = { ...anna, personKey: 'p0' };
    expect(decideMatch([a3, anna, a0], typed))
      .toEqual({ kind: 'existing', personKey: 'p0', nameDiffers: false, duplicateKeys: ['p0', 'p1', 'p3'] });
    const fav = (x: typeof anna) => ({ ...x, isFavorite: true });
    expect(decideMatch([fav(a3), fav(anna)], typed))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false, duplicateKeys: ['p1', 'p3'] });
  });

  it('two addresses of one person count once', () => {
    expect(decideMatch([anna, { ...anna, isFavorite: true }], typed))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false });
    expect(decideMatch([anna, anna], { firstName: 'Anne', lastName: 'Muster' }))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: true });
  });

  it('a person with two addresses (one favourite) wins against a namesake without a favourite', () => {
    const a2 = { ...anna, personKey: 'p0' };
    expect(decideMatch([anna, a2, { ...anna, isFavorite: true }], typed))
      .toEqual({ kind: 'existing', personKey: 'p1', nameDiffers: false, duplicateKeys: ['p0', 'p1'] });
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

  it('shared-email task: fixed title, the other persons by name only', () => {
    expect(SHARED_EMAIL_TASK_NAME).toBe('Newsletter-Anmeldung: geteilte E-Mail-Adresse');
    expect(sharedEmailTaskNotes('Anna Muster', ['Bea Muster', 'Carl Muster'], 'Dorfnews')).toBe(
      'Bei der Anmeldung zum Newsletter Dorfnews wurde der Name «Anna Muster» eingegeben.\n'
      + 'Diese E-Mail-Adresse gehört bereits mehreren Personen: Bea Muster, Carl Muster. Keine davon heisst so.\n'
      + 'Darum wurde «Anna Muster» als neue Person erfasst und angemeldet. Prüfe, ob das stimmt.',
    );
  });

  it('duplicates task: fixed title, the candidates by name only', () => {
    expect(DUPLICATES_TASK_NAME).toBe('Newsletter-Anmeldung: mögliche Duplikate');
    expect(duplicatesTaskNotes('Anna Muster', ['Anna Muster', 'Anna  Muster'], 'Dorfnews')).toBe(
      'Bei der Anmeldung zum Newsletter Dorfnews wurde der Name «Anna Muster» eingegeben.\n'
      + 'Mehrere Personen mit diesem Namen haben diese E-Mail-Adresse: Anna Muster, Anna  Muster.\n'
      + 'Die Anmeldung gilt für eine davon. Prüfe, ob es sich um Duplikate handelt, und führe sie zusammen.',
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
      subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'anna@example.ch', kind: 'duplicates', adminKey: 'a1' }),
      subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'anna@example.ch', kind: 'sharedEmail', adminKey: 'a1' }),
      subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a2' }),
      subscriberTaskId({ tenantId: 't', groupKey: 'h', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a1' }),
      subscriberTaskId({ tenantId: 'u', groupKey: 'g', email: 'anna@example.ch', kind: 'nameDiffers', adminKey: 'a1' }),
      subscriberTaskId({ tenantId: 't', groupKey: 'g', email: 'bea@example.ch', kind: 'nameDiffers', adminKey: 'a1' }),
    ];
    expect(new Set([id, ...others]).size).toBe(7);
  });
});
