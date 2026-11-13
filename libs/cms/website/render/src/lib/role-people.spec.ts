import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrivacyUsage, type PageModel } from '@okr/shared-models';

import type { GroupPersonDoc, PublicPerson } from './group-people';
import { peopleSourceKey, peopleSourceOf } from './people-source';
import { renderSite, type RenderInput, type TemplateSet } from './render-site';
import type { TemplateManifest } from './publish-validation';
import { resolveRolePeople, type RoleAvatarDoc, type RoleDoc } from './role-people';
import { isPlainEmail, mapSection, type SectionDoc } from './section-mapper';

const TENANTS = ['scs'];
const av = (key: string, name1: string, name2: string, extra: Partial<RoleAvatarDoc> = {}): RoleAvatarDoc =>
  ({ key, name1, name2, modelType: 'person', ...extra });
const role = (name: string, responsible?: RoleAvatarDoc, delegate?: RoleAvatarDoc, extra: Partial<RoleDoc> = {}): RoleDoc =>
  ({ name, tenants: ['scs'], isArchived: false, responsibleAvatar: responsible, delegateAvatar: delegate, ...extra });
const pub = (extra: Partial<GroupPersonDoc> = {}): GroupPersonDoc =>
  ({ tenants: ['scs'], usageName: PrivacyUsage.Public, usageImages: PrivacyUsage.Public, ...extra });
const resolve = (ids: string[], roles: Record<string, RoleDoc>, persons: Record<string, GroupPersonDoc>, tenants = TENANTS) =>
  resolveRolePeople(ids, new Map(Object.entries(roles)), new Map(Object.entries(persons)), tenants);

describe('resolveRolePeople', () => {
  const anna = av('p1', 'Anna', 'Muster');
  const beat = av('p2', 'Beat', 'Beispiel');

  it('lists the responsible, then the delegate, of each role in the given order', () => {
    const out = resolve(['kassier', 'praesident'], {
      praesident: role('Präsident', anna),
      kassier: role('Kassier', beat, av('p3', 'Cora', 'Dritte')),
    }, { p1: pub(), p2: pub(), p3: pub() });
    expect(out.map((p) => p.key)).toEqual(['p2', 'p3', 'p1']);
    expect(out[0]).toEqual({ key: 'p2', firstName: 'Beat', lastName: 'Beispiel', label: 'Kassier', showImage: true });
  });

  it('shows a person holding several roles once, labelled with every role name', () => {
    const out = resolve(['a', 'b', 'c'], {
      a: role('Präsident', anna),
      b: role('Kassier', beat, anna),
      c: role('Präsident', anna),
    }, { p1: pub(), p2: pub() });
    expect(out.map((p) => [p.key, p.label])).toEqual([['p1', 'Präsident, Kassier'], ['p2', 'Kassier']]);
  });

  it('skips missing, archived and foreign roles (their names are no label either)', () => {
    const out = resolve(['gone', 'old', 'foreign', 'ok'], {
      old: role('Alt', anna, undefined, { isArchived: true }),
      foreign: role('Fremd', anna, undefined, { tenants: ['other'] }),
      ok: role('Präsident', anna),
    }, { p1: pub() });
    expect(out.map((p) => [p.key, p.label])).toEqual([['p1', 'Präsident']]);
  });

  it('shows person avatars only', () => {
    const out = resolve(['r'], { r: role('Vorstand', av('g1', '', 'Vorstand', { modelType: 'group' }), anna) }, { g1: pub(), p1: pub() });
    expect(out.map((p) => p.key)).toEqual(['p1']);
  });

  it('leaves out a role holder whose name is not public, office holders included', () => {
    const out = resolve(['r'], { r: role('Präsident', anna, beat) }, { p1: pub({ usageName: PrivacyUsage.Restricted }), p2: pub({ usageName: undefined }) });
    expect(out).toEqual([]);
  });

  it('leaves out deceased, archived, foreign and unknown persons', () => {
    const out = resolve(['a', 'b'], {
      a: role('A', anna, beat),
      b: role('B', av('p3', 'C', 'C'), av('p4', 'D', 'D')),
    }, { p1: pub({ isDeceased: true }), p2: pub({ isArchived: true }), p3: pub({ tenants: ['other'] }) });
    expect(out).toEqual([]);
  });

  it('shows the portrait only when the image usage is public (missing = the default, public)', () => {
    const out = resolve(['r'], { r: role('R', anna, beat) }, { p1: pub({ usageImages: PrivacyUsage.Restricted }), p2: pub({ usageImages: undefined }) });
    expect(out.map((p) => p.showImage)).toEqual([false, true]);
  });

  it("gives each person the address of the first role that has one, the role's alias", () => {
    const out = resolve(['a', 'b', 'c'], {
      a: role('Präsident', anna, undefined, { email: '  ' }),
      b: role('Kassier', anna, beat, { email: ' kasse@seeclub.org ' }),
      c: role('Aktuar', anna, undefined, { email: 'aktuar@seeclub.org' }),
    }, { p1: pub(), p2: pub() });
    expect(out.map((p) => [p.key, p.email])).toEqual([['p1', 'kasse@seeclub.org'], ['p2', 'kasse@seeclub.org']]);
  });

  it('ignores validity dates, as the app', () => {
    const out = resolve(['r'], { r: { ...role('R', anna, beat), delegateValidTo: '20200101', validTo: '20200101' } as RoleDoc }, { p1: pub(), p2: pub() });
    expect(out.map((p) => p.key)).toEqual(['p1', 'p2']);
  });
});

describe('peopleSourceOf', () => {
  const people = (properties: Record<string, unknown>): SectionDoc => ({ type: 'people', properties });

  it('reads the roles in order, deduped, and a legacy responsibilityId as a list of one', () => {
    expect(peopleSourceOf(people({ type: 'responsibility', responsibilityIds: ['b', ' a ', 'b', ''] }))).toEqual({ kind: 'responsibility', ids: ['b', 'a'] });
    expect(peopleSourceOf(people({ type: 'responsibility', responsibilityId: 'old' }))).toEqual({ kind: 'responsibility', ids: ['old'] });
    expect(peopleSourceOf(people({ type: 'responsibility', responsibilityIds: ['new'], responsibilityId: 'old' }))).toEqual({ kind: 'responsibility', ids: ['new'] });
    expect(peopleSourceOf(people({ type: 'responsibility', responsibilityIds: ['a/b'] }))).toBeUndefined();
    expect(peopleSourceOf(people({ type: 'responsibility' }))).toBeUndefined();
  });

  it('reads the group, and nothing for persons lists or other sections', () => {
    expect(peopleSourceOf(people({ type: 'group', groupId: 'vorstand' }))).toEqual({ kind: 'group', groupId: 'vorstand' });
    expect(peopleSourceOf(people({ type: 'persons', groupId: 'vorstand' }))).toBeUndefined();
    expect(peopleSourceOf({ type: 'article', properties: { type: 'group', groupId: 'vorstand' } })).toBeUndefined();
    expect(peopleSourceOf(undefined)).toBeUndefined();
  });

  it('keys group and role sources apart', () => {
    expect(peopleSourceKey({ kind: 'group', groupId: 'x' })).toBe('group.x');
    expect(peopleSourceKey({ kind: 'responsibility', ids: ['a', 'b'] })).toBe('responsibility.a,b');
  });
});

describe('mapSection people from roles', () => {
  const sanitize = (h: string) => h;
  const section = (properties: Record<string, unknown>): SectionDoc => ({ type: 'people', state: 'published', tenants: ['scs'], title: 'Kontakt', properties });
  const anna: PublicPerson = { key: 'p1', firstName: 'Anna', lastName: 'Muster', label: 'Präsidentin', showImage: true, email: 'praesident@seeclub.org' };
  const map = new Map([['responsibility.praesident', [anna]]]);
  const persons = (s: SectionDoc, m: ReadonlyMap<string, PublicPerson[]> | undefined = map) =>
    (mapSection('s1', s, new Map(), sanitize, 'de', m) as { persons: PublicPerson[] }).persons;

  it('shows the resolved holders, never the stored list', () => {
    const s = section({ type: 'responsibility', responsibilityIds: ['praesident'], persons: [{ key: 'old', name1: 'Alt' }] });
    expect(persons(s)).toEqual([{ key: 'p1', firstName: 'Anna', lastName: 'Muster', label: 'Präsidentin', showImage: true }]);
  });

  it('reads a legacy responsibilityId section', () => {
    expect(persons(section({ type: 'responsibility', responsibilityId: 'praesident' })).map((p) => p.key)).toEqual(['p1']);
  });

  it('renders no one without resolved holders', () => {
    const s = section({ type: 'responsibility', responsibilityIds: ['praesident'] });
    expect((mapSection('s1', s, new Map(), sanitize) as { persons: unknown[] }).persons).toEqual([]);
    expect(persons(section({ type: 'responsibility', responsibilityIds: ['kassier'] }))).toEqual([]);
  });

  it("emits the role's address only when the info shows email", () => {
    const ids = { type: 'responsibility', responsibilityIds: ['praesident'] };
    expect(persons(section({ ...ids, avatar: { info: ['function', 'email'] } }))[0].email).toBe('praesident@seeclub.org');
    expect(persons(section({ ...ids, avatar: { info: ['emailLink'] } }))[0].email).toBe('praesident@seeclub.org');
    expect(persons(section({ ...ids, avatar: { info: ['function'] } }))[0]).not.toHaveProperty('email');
    expect(persons(section(ids))[0]).not.toHaveProperty('email');
  });

  it('flags the section for a mailto: link only when the info asks for emailLink', () => {
    const ids = { type: 'responsibility', responsibilityIds: ['praesident'] };
    const out = (info?: string[]) => mapSection('s1', section({ ...ids, avatar: { info } }), new Map(), sanitize, 'de', map) as { emailLink?: boolean };
    expect(out(['emailLink']).emailLink).toBe(true);
    expect(out(['email', 'emailLink']).emailLink).toBe(true);
    expect(out(['email'])).not.toHaveProperty('emailLink');
    expect(out(['function'])).not.toHaveProperty('emailLink');
    const group = mapSection('s1', section({ type: 'group', groupId: 'x', avatar: { info: ['emailLink'] } }), new Map(), sanitize) as { emailLink?: boolean };
    expect(group).not.toHaveProperty('emailLink');
  });

  it('drops a role address that is not a plain email address', () => {
    const ids = { type: 'responsibility', responsibilityIds: ['praesident'], avatar: { info: ['emailLink'] } };
    for (const email of ['javascript:alert(1)', 'a@b', 'x"@y.ch', 'a b@c.ch', 'a@b.ch?cc=x@y.ch', '<a@b.ch>']) {
      const m = new Map([['responsibility.praesident', [{ ...anna, email }]]]);
      expect(persons(section(ids), m)[0]).not.toHaveProperty('email');
    }
  });

  it('never emits an address for a group, even one that slipped into the resolved list', () => {
    const leaked = new Map([['group.vorstand', [{ ...anna, email: 'anna.privat@example.org' }]]]);
    const out = persons(section({ type: 'group', groupId: 'vorstand', avatar: { info: ['email'] } }), leaked);
    expect(JSON.stringify(out)).not.toMatch(/email|@/i);
  });
});

describe('renderSite role people', () => {
  const fixtureDir = join(__dirname, '../fixtures/templates');
  const manifest = JSON.parse(readFileSync(join(fixtureDir, 'website.json'), 'utf8')) as TemplateManifest;
  const templates: TemplateSet = {
    manifest: { ...manifest, sectionTypes: ['people'], fixedPages: [] },
    layout: '{{{main}}}',
    partials: {},
    sections: { people: '{{#each persons}}<i>{{firstName}} {{lastName}}:{{label}}:{{email}}</i>{{/each}}' },
    pages: {},
  };
  const input = (people?: RenderInput['people']): RenderInput => ({
    site: { okey: 'fixture', tenants: ['scs'], name: 'F', domain: 'https://example.org', languages: ['de'], nav: [], footer: [], homePageKey: 'home' } as never,
    pages: new Map([['home', { okey: 'home', tenants: ['scs'], sections: ['s1'], title: 'Start', isPrivate: false } as unknown as PageModel]]),
    sections: new Map([['s1', {
      type: 'people', state: 'published', tenants: ['scs'],
      properties: { type: 'responsibility', responsibilityIds: ['praesident'], avatar: { info: ['function', 'email'] } },
    }]]),
    templates,
    imageUrl: (p) => p,
    sanitize: (h) => h,
    people,
  });

  it('passes the resolved holders with label and role address to the people template', () => {
    const res = renderSite(input(new Map([['responsibility.praesident', [{ key: 'p1', firstName: 'Anna', lastName: 'Muster', label: 'Präsidentin', email: 'praesident@seeclub.org' }]]])));
    expect(res.problems).toEqual([]);
    expect(res.files.find((f) => f.path === 'index.html')?.content).toContain('<i>Anna Muster:Präsidentin:praesident@seeclub.org</i>');
  });
});

describe('isPlainEmail', () => {
  it('accepts plain addresses only', () => {
    expect(isPlainEmail('praesident@seeclub.org')).toBe(true);
    expect(isPlainEmail('vor.stand+web@mail.seeclub.ch')).toBe(true);
    for (const v of ['', 'javascript:alert(1)//@x.ch', 'mailto:a@b.ch', 'a@b', '@b.ch', 'a@b.ch.', 'a@@b.ch', undefined, 42]) {
      expect(isPlainEmail(v)).toBe(false);
    }
  });
});
