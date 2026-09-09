import { describe, expect, it } from 'vitest';

import { buildDecisions, ExistingOrg, ExistingPerson, normalizeName } from './vcard-import-matching';
import { VcardImportDraft } from './vcard-import-mapping';

function draft(over: Partial<VcardImportDraft> = {}): VcardImportDraft {
  return {
    kind: 'person', addresses: [], dob: '', dod: '', notes: '', relatedNames: [],
    displayName: 'Anna Muster', sourceFileName: 'k.vcf', warnings: [],
    person: { firstName: 'Anna', lastName: 'Muster' } as never, ...over,
  } as VcardImportDraft;
}
const person = (okey: string, firstName: string, lastName: string, emails: string[] = []): ExistingPerson =>
  ({ okey, firstName, lastName, emails });
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
