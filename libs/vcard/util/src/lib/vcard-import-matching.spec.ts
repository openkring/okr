import { describe, expect, it } from 'vitest';

import { buildDecisions, ExistingOrg, ExistingPerson, normalizeName, phoneMatch } from './vcard-import-matching';
import { VcardImportDraft } from './vcard-import-mapping';

function draft(over: Partial<VcardImportDraft> = {}): VcardImportDraft {
  return {
    kind: 'person', addresses: [], dob: '', dod: '', notes: '', relatedNames: [],
    displayName: 'Anna Muster', sourceFileName: 'k.vcf', warnings: [],
    person: { firstName: 'Anna', lastName: 'Muster' } as never, ...over,
  } as VcardImportDraft;
}
const person = (okey: string, firstName: string, lastName: string, emails: string[] = [], phones: string[] = []): ExistingPerson =>
  ({ okey, firstName, lastName, emails, phones });
const tel = (phone: string) => ({ addressChannel: 'phone', phone }) as never;
const mail = (email: string) => ({ addressChannel: 'email', email }) as never;
const org = (okey: string, name: string): ExistingOrg => ({ okey, name });

describe('normalizeName', () => {
  it('folds case, diacritics and whitespace', () => {
    expect(normalizeName('  Ánna   Müller ')).toBe('anna muller');
    expect(normalizeName('Anna')).toBe(normalizeName('  anna  '));
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('buildDecisions', () => {
  it('marks a card with no match as import', () => {
    const [d] = buildDecisions([draft()], [], []);
    expect(d.action).toBe('import');
    expect(d.duplicates).toEqual([]);
  });

  it('matches on name and preselects merge', () => {
    const [d] = buildDecisions([draft()], [person('p1', 'Anna', 'Muster')], []);
    expect(d.duplicates.map((p) => p.okey)).toEqual(['p1']);
    expect(d.action).toBe('merge');
  });

  it('never treats an org card as a duplicate of a person, even on a shared email', () => {
    const orgCard = draft({
      kind: 'org',
      person: undefined,
      org: { name: 'Acme AG' } as never,
      displayName: 'Acme AG',
      addresses: [{ addressChannel: 'email', email: 'info@acme.ch' } as never],
    });
    const [d] = buildDecisions([orgCard], [person('p1', 'Anna', 'Muster', ['info@acme.ch'])], []);
    expect(d.duplicates).toEqual([]);
    expect(d.action).toBe('import');
  });

  it('matches an org card against the tenant orgs by normalized name (§5.2)', () => {
    const orgCard = draft({ kind: 'org', person: undefined, org: { name: 'Acme AG' } as never, displayName: 'Acme AG' });
    const [d] = buildDecisions([orgCard], [], [org('o1', ' acme   ag ')]);
    expect(d.orgDuplicates.map((o) => o.okey)).toEqual(['o1']);
    expect(d.action).toBe('merge');
    // the PERSON merge path must stay closed for an org card
    expect(d.duplicates).toEqual([]);
  });

  it('leaves an unknown org card as a plain import', () => {
    const orgCard = draft({ kind: 'org', person: undefined, org: { name: 'Neu GmbH' } as never, displayName: 'Neu GmbH' });
    const [d] = buildDecisions([orgCard], [], [org('o1', 'Acme AG')]);
    expect(d.orgDuplicates).toEqual([]);
    expect(d.action).toBe('import');
  });

  it('never reports a PERSON card as an org duplicate', () => {
    const [d] = buildDecisions([draft()], [], [org('o1', 'Anna Muster')]);
    expect(d.orgDuplicates).toEqual([]);
  });

  it('recognises the same org twice in one file as a batch sibling (no okey to merge into)', () => {
    const first = draft({ kind: 'org', person: undefined, org: { name: 'Acme AG' } as never, displayName: 'Acme AG' });
    const second = draft({ kind: 'org', person: undefined, org: { name: 'Acme AG' } as never, displayName: 'Acme AG' });
    const [, d] = buildDecisions([first, second], [], []);
    expect(d.orgDuplicates.map((o) => o.okey)).toEqual(['']);
  });

  it('lets an email match win over a name match', () => {
    const withEmail = draft({ addresses: [{ addressChannel: 'email', email: 'Anna@Example.CH' } as never] });
    const [d] = buildDecisions([withEmail], [person('p2', 'Andere', 'Person', ['anna@example.ch']), person('p1', 'Anna', 'Muster')], []);
    expect(d.duplicates[0].okey).toBe('p2');
  });

  it('resolves an employer that exists', () => {
    const [d] = buildDecisions([draft({ employment: { orgName: 'Acme AG', department: '', title: '', role: '' } })], [], [org('o1', 'acme ag')]);
    expect(d.employerKey).toBe('o1');
    expect(d.createEmployer).toBe(false);
  });

  it('proposes creating an employer that does not exist, default off', () => {
    const [d] = buildDecisions([draft({ employment: { orgName: 'Neu GmbH', department: '', title: '', role: '' } })], [], []);
    expect(d.employerKey).toBe('');
    expect(d.createEmployer).toBe(false);
    expect(d.employerCandidates).toEqual([]);
  });

  it('does not auto-link an ambiguous employer', () => {
    const [d] = buildDecisions([draft({ employment: { orgName: 'Acme', department: '', title: '', role: '' } })], [], [org('o1', 'Acme'), org('o2', 'acme')]);
    expect(d.employerKey).toBe('');
    expect(d.employerCandidates).toHaveLength(2);
  });

  it('leaves an intra-batch relation unresolved at decision time (commit resolves it)', () => {
    const a = draft({ displayName: 'Anna Muster', person: { firstName: 'Anna', lastName: 'Muster' } as never });
    const b = draft({
      displayName: 'Beat Muster', person: { firstName: 'Beat', lastName: 'Muster' } as never,
      relatedNames: [{ name: 'Anna Muster', label: '_$!<Spouse>!$_' }],
    });
    const [, second] = buildDecisions([a, b], [], []);
    expect(second.relations[0].personKey).toBe('');
    expect(second.relations[0].candidates).toEqual([]);
    expect(second.relations[0].createPerson).toBe(false);
  });

  it('resolves a related person that already exists in the tenant', () => {
    const d = draft({ relatedNames: [{ name: 'Beat Muster', label: 'spouse' }] });
    const [decision] = buildDecisions([d], [person('p9', 'Beat', 'Muster')], []);
    expect(decision.relations[0].personKey).toBe('p9');
  });
});

describe('phoneMatch', () => {
  it('folds CH formats', () => {
    expect(phoneMatch('079 123 45 67', '+41791234567')).toBe(true);
    expect(phoneMatch('0041 79 123 45 67', '079 123 45 67')).toBe(true);
    expect(phoneMatch('079 123 45 67', '079 123 45 68')).toBe(false);
  });

  it('ignores unparseable numbers', () => {
    expect(phoneMatch('Zentrale', '079 123 45 67')).toBe(false);
    expect(phoneMatch('', '')).toBe(false);
    expect(phoneMatch('+41 44', '+41 44')).toBe(false);
  });
});

describe('buildDecisions — phone rule (1.159 §4.1)', () => {
  it('matches on phone when no email matches', () => {
    const card = draft({ displayName: 'A. M.', person: { firstName: 'A.', lastName: 'M.' } as never, addresses: [tel('079 123 45 67')] });
    const [d] = buildDecisions([card], [person('p1', 'Anna', 'Muster', [], ['+41791234567'])], []);
    expect(d.duplicates.map((p) => p.okey)).toEqual(['p1']);
    expect(d.action).toBe('merge');
  });

  it('lets an email match win over a phone match', () => {
    const card = draft({ addresses: [mail('anna@x.ch'), tel('079 123 45 67')] });
    const [d] = buildDecisions([card], [
      person('byPhone', 'Other', 'One', [], ['079 123 45 67']),
      person('byMail', 'Third', 'Person', ['anna@x.ch']),
    ], []);
    expect(d.duplicates.map((p) => p.okey)).toEqual(['byMail']);
  });

  it('never matches an org card to a person by phone', () => {
    const orgCard = draft({ kind: 'org', person: undefined, org: { name: 'Acme AG' } as never, displayName: 'Acme AG', addresses: [tel('044 000 00 00')] });
    const [d] = buildDecisions([orgCard], [person('p1', 'Anna', 'Muster', [], ['044 000 00 00'])], []);
    expect(d.duplicates).toEqual([]);
  });

  it('offers two cards of one file sharing a mobile as duplicates', () => {
    const a = draft({ displayName: 'Anna Muster', addresses: [tel('079 123 45 67')] });
    const b = draft({ displayName: 'Anni', person: { firstName: 'Anni', lastName: '' } as never, addresses: [tel('+41 79 123 45 67')] });
    const [, d] = buildDecisions([a, b], [], []);
    expect(d.action).toBe('merge');
    expect(d.duplicates[0].okey).toBe('');
  });
});

describe('buildDecisions — intra-batch target (1.159 §4.1)', () => {
  it('an intra-batch duplicate names the index of the earlier card', () => {
    const a = draft({ displayName: 'Anna Muster', addresses: [tel('079 123 45 67')] });
    const other = draft({ displayName: 'Bea Beispiel', person: { firstName: 'Bea', lastName: 'Beispiel' } as never });
    const b = draft({ displayName: 'Anni', person: { firstName: 'Anni', lastName: '' } as never, addresses: [tel('+41 79 123 45 67')] });
    const [, , d] = buildDecisions([a, other, b], [], []);
    expect(d.duplicates[0].batchIndex).toBe(0);
  });

  it('an existing person carries no batchIndex', () => {
    const [d] = buildDecisions([draft()], [person('p1', 'Anna', 'Muster')], []);
    expect(d.duplicates[0].batchIndex).toBeUndefined();
  });
});

describe('buildDecisions — shared lines (final review)', () => {
  const work = (phone: string) => ({ addressChannel: 'phone', phone, addressUsage: 'work' }) as never;

  it('never merges two colleagues on a shared office line (TEL;TYPE=WORK)', () => {
    const anna = draft({ displayName: 'Anna Beispiel', person: { firstName: 'Anna', lastName: 'Beispiel' } as never, addresses: [work('044 123 45 00')] });
    const hans = draft({ displayName: 'Hans Muster', person: { firstName: 'Hans', lastName: 'Muster' } as never, addresses: [work('+41 44 123 45 00')] });
    const [, d] = buildDecisions([anna, hans], [], []);
    expect(d.action).toBe('import');
    expect(d.duplicates).toEqual([]);
  });

  it('ignores a number two existing persons share', () => {
    const card = draft({ displayName: 'Hans Muster', person: { firstName: 'Hans', lastName: 'Muster' } as never, addresses: [tel('044 123 45 00')] });
    const [d] = buildDecisions([card], [
      person('p1', 'Anna', 'Beispiel', [], ['044 123 45 00']),
      person('p2', 'Bea', 'Beispiel', [], ['+41441234500']),
    ], []);
    expect(d.duplicates).toEqual([]);
  });

  it('matches 4000 cards against 4000 persons within a second', () => {
    const persons = Array.from({ length: 4000 }, (_, i) => person(`p${i}`, `F${i}`, `L${i}`, [], [`079 ${String(1000000 + i)}`]));
    const drafts = Array.from({ length: 4000 }, (_, i) => draft({ displayName: `X${i}`, person: { firstName: `X${i}`, lastName: 'Y' } as never, addresses: [tel(`+41 79 ${String(1000000 + i)}`)] }));
    const t0 = Date.now();
    const decisions = buildDecisions(drafts, persons, []);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(decisions[123].duplicates[0].okey).toBe('p123');
  }, 30_000);
});

describe('buildDecisions — a shared line stays shared', () => {
  it('a number two existing persons share never links two cards of the file', () => {
    const a = draft({ displayName: 'Hans Muster', person: { firstName: 'Hans', lastName: 'Muster' } as never, addresses: [tel('044 123 45 00')] });
    const b = draft({ displayName: 'Ida Muster', person: { firstName: 'Ida', lastName: 'Muster' } as never, addresses: [tel('044 123 45 00')] });
    const [, d] = buildDecisions([a, b], [
      person('p1', 'Anna', 'Beispiel', [], ['044 123 45 00']),
      person('p2', 'Bea', 'Beispiel', [], ['044 123 45 00']),
    ], []);
    expect(d.duplicates).toEqual([]);
  });
});
