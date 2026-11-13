import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrivacyUsage, type PageModel } from '@okr/shared-models';

import { PUBLIC_USAGE, resolveGroupPeople, type GroupMembershipDoc, type GroupPersonDoc, type PublicPerson } from './group-people';
import { renderSite, type RenderInput, type TemplateSet } from './render-site';
import type { TemplateManifest } from './publish-validation';
import { mapSection, type SectionDoc } from './section-mapper';

const TODAY = '20261113';
const TENANTS = ['scs'];

function ms(memberKey: string, memberName1: string, memberName2: string, extra: Partial<GroupMembershipDoc> = {}): GroupMembershipDoc {
  return {
    orgKey: 'vorstand', orgModelType: 'group', memberKey, memberModelType: 'person', memberName1, memberName2,
    tenants: ['scs'], isArchived: false, dateOfExit: '99991231', ...extra,
  };
}
const pub = (extra: Partial<GroupPersonDoc> = {}): GroupPersonDoc => ({ tenants: ['scs'], usageName: PrivacyUsage.Public, usageImages: PrivacyUsage.Public, ...extra });
const resolve = (m: GroupMembershipDoc[], p: Record<string, GroupPersonDoc>, tenants = TENANTS) =>
  resolveGroupPeople('vorstand', m, new Map(Object.entries(p)), tenants, TODAY);

describe('resolveGroupPeople', () => {
  it('keeps PUBLIC_USAGE in step with PrivacyUsage.Public', () => {
    expect(PUBLIC_USAGE).toBe(PrivacyUsage.Public);
  });

  it('maps an active member with a public name to the website person shape, without label or email', () => {
    expect(resolve([ms('p1', 'Anna', 'Muster')], { p1: pub() })).toEqual([
      { key: 'p1', firstName: 'Anna', lastName: 'Muster', label: '', showImage: true },
    ]);
  });

  it('keeps only active person memberships of this group and of a site tenant', () => {
    const memberships = [
      ms('p1', 'A', 'Aktiv'),
      ms('p2', 'B', 'Archiviert', { isArchived: true }),
      ms('p3', 'C', 'Ausgetreten', { dateOfExit: '20250101' }),
      ms('p4', 'D', 'Heute', { dateOfExit: TODAY }),
      ms('p5', 'E', 'Morgen', { dateOfExit: '20261114' }),
      ms('p6', 'F', 'Fremd', { tenants: ['p13'] }),
      ms('p7', 'G', 'Andere', { orgKey: 'jugend' }),
      ms('p8', 'H', 'Org', { orgModelType: 'org' }),
      ms('o1', '', 'Firma', { memberModelType: 'org' }),
      ms('p9', 'I', 'Offen', { dateOfExit: '' }),
    ];
    const persons = Object.fromEntries(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'o1', 'p9'].map((k) => [k, pub()]));
    expect(resolve(memberships, persons).map((p) => p.key)).toEqual(['p1', 'p5', 'p9']);
  });

  it('leaves out, silently, everyone whose name is not public (missing = the default Restricted)', () => {
    const persons = {
      p1: pub(),
      p2: pub({ usageName: PrivacyUsage.Restricted }),
      p3: pub({ usageName: PrivacyUsage.Protected }),
      p4: pub({ usageName: undefined }),
    };
    const out = resolve([ms('p1', 'A', 'A'), ms('p2', 'B', 'B'), ms('p3', 'C', 'C'), ms('p4', 'D', 'D')], persons);
    expect(out.map((p) => p.key)).toEqual(['p1']);
  });

  it('leaves out a missing, archived or foreign person', () => {
    const out = resolve([ms('p1', 'A', 'A'), ms('p2', 'B', 'B'), ms('p3', 'C', 'C')], {
      p2: pub({ isArchived: true }),
      p3: pub({ tenants: ['p13'] }),
    });
    expect(out).toEqual([]);
  });

  it('leaves out a deceased person even with an open membership and a public name', () => {
    const out = resolve([ms('p1', 'A', 'A'), ms('p2', 'B', 'B')], { p1: pub({ isDeceased: true }), p2: pub() });
    expect(out.map((p) => p.key)).toEqual(['p2']);
  });

  it('shows the portrait only when usageImages is public (missing = the default Public)', () => {
    const out = resolve([ms('p1', 'A', 'A'), ms('p2', 'B', 'B'), ms('p3', 'C', 'C'), ms('p4', 'D', 'D')], {
      p1: pub(),
      p2: pub({ usageImages: PrivacyUsage.Restricted }),
      p3: pub({ usageImages: PrivacyUsage.Protected }),
      p4: pub({ usageImages: undefined }),
    });
    expect(out.map((p) => [p.key, p.showImage])).toEqual([['p1', true], ['p2', false], ['p3', false], ['p4', true]]);
  });

  it('orders by last name as the app does (memberName2 ascending, ties in query order) and lists a person once', () => {
    const out = resolve(
      [ms('p1', 'Zoe', 'Meier'), ms('p2', 'Anna', 'Bauer'), ms('p3', 'Beat', 'Meier'), ms('p2', 'Anna', 'Bauer')],
      { p1: pub(), p2: pub(), p3: pub() },
    );
    expect(out.map((p) => `${p.firstName} ${p.lastName}`)).toEqual(['Anna Bauer', 'Zoe Meier', 'Beat Meier']);
  });

  it('is empty without a group, without memberships or when no member qualifies', () => {
    expect(resolveGroupPeople('', [ms('p1', 'A', 'A')], new Map([['p1', pub()]]), TENANTS, TODAY)).toEqual([]);
    expect(resolve([], {})).toEqual([]);
    expect(resolve([ms('p1', 'A', 'A')], { p1: pub({ usageName: PrivacyUsage.Restricted }) })).toEqual([]);
  });
});

describe('mapSection people', () => {
  const sanitize = (h: string) => h;
  const people = (properties: Record<string, unknown>): SectionDoc => ({ type: 'people', state: 'published', tenants: ['scs'], title: 'Vorstand', properties });
  const anna: PublicPerson = { key: 'p1', firstName: 'Anna', lastName: 'Muster', label: '', showImage: false };

  it('a group section shows the resolved members of its group, never the stored list', () => {
    const s = people({ type: 'group', groupId: 'vorstand', persons: [{ key: 'old', name1: 'Alt', name2: 'Gespeichert' }] });
    const out = mapSection('s1', s, new Map(), sanitize, 'de', new Map([['group.vorstand', [anna]]])) as { persons: PublicPerson[] };
    expect(out.persons).toEqual([anna]);
  });

  it('a group section without resolved members renders no one', () => {
    const s = people({ type: 'group', groupId: 'vorstand', persons: [{ key: 'old', name1: 'Alt' }] });
    expect((mapSection('s1', s, new Map(), sanitize) as { persons: unknown[] }).persons).toEqual([]);
    expect((mapSection('s1', people({ type: 'group' }), new Map(), sanitize, 'de', new Map([['group.vorstand', [anna]]])) as { persons: unknown[] }).persons).toEqual([]);
  });

  it('emits no email for group or persons sections, even with the email info option', () => {
    const avatar = { info: ['function', 'email'] };
    const group = mapSection('s1', people({ type: 'group', groupId: 'vorstand', avatar }), new Map(), sanitize, 'de', new Map([['group.vorstand', [anna]]]));
    const persons = mapSection('s2', people({ type: 'persons', avatar, persons: [{ key: 'p1', name1: 'Anna', name2: 'Muster', label: 'Präsidentin' }] }), new Map(), sanitize);
    expect(JSON.stringify([group, persons])).not.toMatch(/email|@/i);
  });

  it('leaves the output of an explicit persons section unchanged', () => {
    const out = mapSection('s2', people({ type: 'persons', persons: [{ key: 'p1', name1: 'Anna', name2: 'Muster', label: 'Präsidentin' }] }), new Map(), sanitize);
    expect(out).toEqual({
      type: 'people', name: '', title: 'Vorstand', subTitle: '',
      persons: [{ key: 'p1', firstName: 'Anna', lastName: 'Muster', label: 'Präsidentin' }],
    });
  });
});

describe('renderSite group people', () => {
  const fixtureDir = join(__dirname, '../fixtures/templates');
  const manifest = JSON.parse(readFileSync(join(fixtureDir, 'website.json'), 'utf8')) as TemplateManifest;
  const templates: TemplateSet = {
    manifest: { ...manifest, sectionTypes: ['people'], fixedPages: [] },
    layout: '{{{main}}}',
    partials: {},
    sections: { people: '{{#each persons}}<i>{{firstName}} {{lastName}}:{{showImage}}</i>{{/each}}' },
    pages: {},
  };
  const input = (people?: RenderInput['people']): RenderInput => ({
    site: { okey: 'fixture', tenants: ['scs'], name: 'F', domain: 'https://example.org', languages: ['de'], nav: [], footer: [], homePageKey: 'home' } as never,
    pages: new Map([['home', { okey: 'home', tenants: ['scs'], sections: ['s1'], title: 'Start', isPrivate: false } as unknown as PageModel]]),
    sections: new Map([['s1', { type: 'people', state: 'published', tenants: ['scs'], properties: { type: 'group', groupId: 'vorstand' } }]]),
    templates,
    imageUrl: (p) => p,
    sanitize: (h) => h,
    people,
  });

  it('passes the resolved members to the people template', () => {
    const res = renderSite(input(new Map([['group.vorstand', [{ key: 'p1', firstName: 'Anna', lastName: 'Muster', label: '', showImage: false }]]])));
    expect(res.problems).toEqual([]);
    expect(res.files.find((f) => f.path === 'index.html')?.content).toContain('<i>Anna Muster:false</i>');
  });

  it('renders no one without resolved members', () => {
    const res = renderSite(input());
    expect(res.files.find((f) => f.path === 'index.html')?.content).not.toContain('<i>');
  });
});
