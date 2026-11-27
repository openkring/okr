// pnpm exec esbuild scripts/migrate-people-look.logic.test.ts --bundle --platform=node --packages=external \
//   --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/migrate-people-look.logic.test.cjs
// node --test dist/scripts/migrate-people-look.logic.test.cjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applySkip, backupName, buildPlan, entriesOf, exitCodeOf, parseArgs, parsePlan, planDocument, planPeopleMigration, reportOf, skipSummary, summaryOf,
  undoSkip, updateTimeOf, websiteDiffers, type StoredPeopleSection, type WriteEntry,
} from './migrate-people-look.logic';

const avatar = (more: object = {}): Record<string, unknown> => ({
  color: 6, nameDisplay: 0, altText: 'Avatar von @NAME@', title: '', linkedSection: '', view: 'card', perRow: 5, sliderRows: 1,
  imgWidth: 200, imgHeight: 200, imgRadius: '5px', facePad: 0, background: 'orgColor', bgOrgColor: 'alternating', bgColors: [],
  grayscale: true, info: ['function'], infoPosition: 'below', ...more,
});
const person = (key: string): object => ({ key, name1: `F${key}`, name2: `L${key}`, label: '', modelType: 'person', type: 'person' });
const section = (name: string, properties: object): StoredPeopleSection => ({ type: 'people', name, tenants: ['scs'], properties });
const IDS9 = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'];
const IDS7 = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'];

const SECTIONS: Record<string, { section: StoredPeopleSection; look: object; dropped: string[] }> = {
  'J+S Leiter': {
    section: section('J+S Leiter', { type: 'group', groupId: 'jsleiter', avatar: avatar(), persons: [], responsibilityIds: [] }),
    look: { size: 'M', shape: 'rounded', fill: 'alternating', grayscale: true, textPosition: 'below' }, dropped: [],
  },
  Verantwortliche: {
    section: section('Verantwortliche', {
      type: 'responsibility', responsibilityId: 'memberAdmin', groupId: 'vorstand', persons: [],
      avatar: avatar({ imgWidth: 300, imgHeight: 300, bgOrgColor: 'primary', grayscale: false, info: ['function', 'email'], infoPosition: 'overlayBottom' }),
    }),
    look: { size: 'L', shape: 'rounded', fill: 'primary', grayscale: false, textPosition: 'overlay' }, dropped: ['groupId', 'responsibilityId'],
  },
  'Weitere Aufgaben': {
    section: section('Weitere Aufgaben', {
      type: 'responsibility', responsibilityIds: IDS9, persons: [], avatar: avatar({ imgRadius: '4px', info: ['function', 'email'] }),
    }),
    look: { size: 'M', shape: 'rounded', fill: 'alternating', grayscale: true, textPosition: 'below' }, dropped: [],
  },
  'Unsere Coaches': {
    section: section('Unsere Coaches', {
      type: 'responsibility', responsibilityParentKey: 'group.trainer', responsibilityParentName: 'Trainer', persons: [], cols: 2,
      avatar: avatar({ imgWidth: 120, imgHeight: 120 }),
    }),
    look: { size: 'S', shape: 'rounded', fill: 'alternating', grayscale: true, textPosition: 'below' }, dropped: [],
  },
  Vorstand: {
    section: section('Vorstand', {
      type: 'responsibility', responsibilityIds: IDS7, groupId: 'vorstand', persons: [person('p1')], avatar: avatar({ info: ['function', 'email'] }),
    }),
    look: { size: 'M', shape: 'rounded', fill: 'alternating', grayscale: true, textPosition: 'below' }, dropped: ['groupId'],
  },
  Coaches: {
    section: section('Coaches', {
      type: 'responsibility', responsibilityParentKey: 'group.trainer', responsibilityIds: [], persons: [],
      avatar: avatar({ imgRadius: '4px', info: ['function', 'email'] }),
    }),
    look: { size: 'M', shape: 'rounded', fill: 'alternating', grayscale: true, textPosition: 'below' }, dropped: [],
  },
  Bootshauskommission: {
    section: section('Bootshauskommission', {
      type: 'persons', groupId: 'bhproj', persons: ['a', 'b', 'c', 'd', 'e', 'f'].map(person), cols: 2,
      avatar: avatar({
        imgWidth: 120, imgHeight: 120, imgRadius: '50%', background: 'original', bgOrgColor: 'primary', grayscale: false,
        info: ['function', 'emailLink'], infoPosition: 'right', width: 'article',
      }),
    }),
    look: { size: 'S', shape: 'round', fill: 'original', grayscale: false, textPosition: 'right' }, dropped: ['groupId'],
  },
};

const OLD = ['imgWidth', 'imgHeight', 'imgRadius', 'facePad', 'background', 'bgOrgColor', 'bgColors', 'color', 'perRow', 'sliderRows', 'infoPosition'];

for (const [name, { section: s, look, dropped }] of Object.entries(SECTIONS)) {
  test(`plans ${name}: the look fields, the old ones gone, stale fields dropped`, () => {
    const plan = planPeopleMigration(s);
    assert.equal(plan.action, 'write');
    if (plan.action !== 'write') return;
    const av = plan.patch.avatar as unknown as Record<string, unknown>;
    assert.equal(av['size'], look['size' as keyof typeof look]);
    assert.equal(av['shape'], look['shape' as keyof typeof look]);
    assert.equal(av['fill'], look['fill' as keyof typeof look]);
    assert.equal(av['grayscale'], look['grayscale' as keyof typeof look]);
    assert.equal(av['textPosition'], look['textPosition' as keyof typeof look]);
    for (const f of OLD) assert.equal(f in av, false, f);
    for (const f of dropped) assert.equal(f in plan.patch, false, f);
    // what the section keeps
    assert.deepEqual((av['info']), (s.properties as { avatar: { info: unknown } }).avatar.info);
    assert.equal(av['view'], 'card');
  });
}

test('Verantwortliche folds responsibilityId into responsibilityIds', () => {
  const plan = planPeopleMigration(SECTIONS['Verantwortliche'].section);
  assert.equal(plan.action === 'write' && JSON.stringify(plan.patch.responsibilityIds), '["memberAdmin"]');
});
test('a legacy responsibilityId folds into an empty list; next to a listed one it is inert and dropped', () => {
  const p = (ids: string[]): unknown => {
    const plan = planPeopleMigration(section('x', { type: 'responsibility', responsibilityId: 'a', responsibilityIds: ids, persons: [], avatar: avatar() }));
    return plan.action === 'write' ? [plan.patch.responsibilityIds, 'responsibilityId' in plan.patch] : plan;
  };
  assert.deepEqual(p([]), [['a'], false]);
  assert.deepEqual(p(['b', 'a']), [['b', 'a'], false]);
  assert.deepEqual(p(['b']), [['b'], false]);
});
test('legacy showName/showLabel keep the same drawing', () => {
  const s = section('L', { type: 'group', groupId: 'g', persons: [], avatar: { showName: false, showLabel: true, title: 'X' } });
  const plan = planPeopleMigration(s);
  assert.equal(plan.action, 'write');
  if (plan.action !== 'write') return;
  const av = plan.patch.avatar as unknown as Record<string, unknown>;
  assert.equal(av['nameDisplay'], 4);
  assert.deepEqual(av['info'], ['function']);
  assert.equal('showName' in av || 'showLabel' in av, false);
  assert.equal(av['title'], 'X');
});
test('websiteDiffers sees a changed source, a hide and an order', () => {
  const base = { type: 'responsibility', responsibilityIds: ['a'], persons: [], avatar: avatar(), hiddenKeys: ['x'] };
  const same = section('s', base);
  assert.equal(websiteDiffers(same, base), false);
  assert.equal(websiteDiffers(same, { ...base, responsibilityIds: ['a', 'b'] }), true);
  assert.equal(websiteDiffers(same, { ...base, hiddenKeys: [] }), true);
  assert.equal(websiteDiffers(section('o', { ...base, orderKeys: ['b', 'a'] }), { ...base, orderKeys: ['a', 'b'] }), true);
});
test('Vorstand drops persons, Bootshauskommission keeps them, groups keep groupId', () => {
  const v = planPeopleMigration(SECTIONS['Vorstand'].section);
  const b = planPeopleMigration(SECTIONS['Bootshauskommission'].section);
  const g = planPeopleMigration(SECTIONS['J+S Leiter'].section);
  assert.deepEqual(v.action === 'write' && v.patch.persons, []);
  assert.equal(b.action === 'write' && b.patch.persons?.length, 6);
  assert.equal(g.action === 'write' && g.patch.groupId, 'jsleiter');
});
test('the stale field cols and the width stay as they are', () => {
  const c = planPeopleMigration(SECTIONS['Unsere Coaches'].section);
  const b = planPeopleMigration(SECTIONS['Bootshauskommission'].section);
  assert.equal(c.action === 'write' && (c.patch as Record<string, unknown>)['cols'], 2);
  assert.equal(b.action === 'write' && (b.patch.avatar as unknown as Record<string, unknown>)['width'], 'article');
});

test('excludedPersons become hiddenKeys, also for an unstyled section whose avatar is left alone', () => {
  const plain = { type: 'group', groupId: 'g', persons: [], excludedPersons: [person('x'), person('y')], avatar: { view: 'card', altText: '' } };
  const plan = planPeopleMigration(section('plain', plain));
  assert.equal(plan.action, 'write');
  if (plan.action !== 'write') return;
  assert.deepEqual(plan.patch.hiddenKeys, ['x', 'y']);
  assert.equal('excludedPersons' in plan.patch, false);
  assert.deepEqual(plan.patch.avatar, plain.avatar);
});
test('stale override keys are not dropped: every referenced key survives', () => {
  const plan = planPeopleMigration(section('s', { type: 'group', groupId: 'g', persons: [], hiddenKeys: ['h'], orderKeys: ['o1', 'o2'], excludedPersons: [person('x')], avatar: avatar() }));
  assert.equal(plan.action, 'write');
  if (plan.action !== 'write') return;
  assert.deepEqual(plan.patch.hiddenKeys?.slice().sort(), ['h', 'x']);
  assert.deepEqual(plan.patch.orderKeys, ['o1', 'o2']);
});
test('an unstyled section without overrides or stale fields has nothing to do', () => {
  assert.deepEqual(planPeopleMigration(section('d', { type: 'group', groupId: 'g', persons: [], avatar: { view: 'card' } })), { action: 'leave', reason: 'nothing-to-do' });
  assert.deepEqual(planPeopleMigration(section('d', { type: 'persons', persons: [person('a')] })), { action: 'leave', reason: 'nothing-to-do' });
});
test('a section that is already migrated has nothing to do; so is the result of a plan', () => {
  for (const { section: s } of Object.values(SECTIONS)) {
    const plan = planPeopleMigration(s);
    assert.equal(plan.action, 'write');
    if (plan.action !== 'write') continue;
    assert.deepEqual(planPeopleMigration({ ...s, properties: plan.patch }), { action: 'leave', reason: 'nothing-to-do' });
  }
});
test('other sections are not people', () => {
  assert.deepEqual(planPeopleMigration({ type: 'article', properties: {} }), { action: 'leave', reason: 'not-people' });
  assert.deepEqual(planPeopleMigration({ type: 'people', properties: null }), { action: 'leave', reason: 'not-people' });
  assert.deepEqual(planPeopleMigration({ type: 'people', properties: { type: 'other' } }), { action: 'leave', reason: 'not-people' });
});

test('the website output is the same before and after for every planned write (the 4px → 5px radius is not drawn)', () => {
  // planPeopleMigration leaves a section out when it differs: all seven must be planned as write
  for (const [name, { section: s }] of Object.entries(SECTIONS)) assert.equal(planPeopleMigration(s).action, 'write', name);
});

// ------------------------------------------------- plan, guards, reports ------------------------------------------------

const UT = { seconds: 10, nanoseconds: 5 };
const writeEntry = (s: StoredPeopleSection = SECTIONS['Vorstand'].section): WriteEntry => {
  const e = planDocument('k1', s, updateTimeOf(UT));
  assert.equal(e.action, 'write');
  return e as WriteEntry;
};

test('planDocument lists the changed field names only, never values', () => {
  const e = writeEntry(SECTIONS['Verantwortliche'].section);
  assert.deepEqual(e.changes.filter((c) => !c.startsWith('avatar.')), ['groupId', 'responsibilityId', 'responsibilityIds']);
  assert.ok(e.changes.includes('avatar.imgWidth') && e.changes.includes('avatar.size'));
  assert.equal(JSON.stringify(e.changes).includes('memberAdmin'), false);
});
test('applySkip: missing, other tenant, edited since the trial, done, patch differs', () => {
  const s = SECTIONS['Vorstand'].section;
  const e = writeEntry(s);
  const current = (section: StoredPeopleSection, t = updateTimeOf(UT)): { section: StoredPeopleSection; updateTime: string } => ({ section, updateTime: t });
  assert.equal(applySkip(e, current(s), 'scs'), undefined);
  assert.equal(applySkip(e, undefined, 'scs'), 'missing');
  assert.equal(applySkip(e, current(s), 'other'), 'not-of-tenant');
  assert.equal(applySkip(e, current(s, '11.000000000'), 'scs'), 'changed-since-trial');
  assert.equal(applySkip(e, current({ ...s, properties: e.patch }), 'scs'), 'done');
  assert.equal(applySkip({ ...e, patch: { ...e.patch, hiddenKeys: ['z'] } }, current(s), 'scs'), 'patch-differs');
});
test('undoSkip restores only what the apply wrote', () => {
  const s = SECTIONS['Vorstand'].section;
  const e = writeEntry(s);
  assert.equal(undoSkip(e, { ...s, properties: e.patch }, 'scs'), undefined);
  assert.equal(undoSkip(e, { ...s, properties: { ...e.patch, hiddenKeys: ['z'] } }, 'scs'), 'edited');
  assert.equal(undoSkip(e, s, 'scs'), 'not-applied');
  assert.equal(undoSkip(e, undefined, 'scs'), 'missing');
  assert.equal(undoSkip(e, { ...s, properties: e.patch }, 'other'), 'not-of-tenant');
  assert.deepEqual(e.before, s.properties);
});

test('buildPlan, parsePlan and entriesOf', () => {
  const plan = buildPlan([['b', SECTIONS['Vorstand'].section, UT], ['a', { type: 'article', properties: {} }, UT]], '2026-11-27T00:00:00Z', 'p');
  assert.deepEqual(plan.entries.map((e) => e.key), ['a', 'b']);
  assert.deepEqual(parsePlan(JSON.stringify(plan), 'p'), plan);
  assert.throws(() => parsePlan(JSON.stringify(plan), 'q'), /project/);
  assert.throws(() => parsePlan('{', 'p'), /not a plan/);
  assert.throws(() => parsePlan(JSON.stringify({ ...plan, entries: [...plan.entries, plan.entries[0]] }), 'p'), /twice/);
  assert.deepEqual(entriesOf(plan, 'scs').map((e) => e.key), ['b']);
  assert.deepEqual(entriesOf(plan, 'x'), []);
});
test('reports hold names and field names, no values', () => {
  const plan = buildPlan([['b', SECTIONS['Verantwortliche'].section, UT]], 'T', 'p');
  const report = reportOf(plan, 'scs');
  assert.match(report, /Verantwortliche/);
  assert.match(report, /avatar\.size/);
  assert.equal(report.includes('memberAdmin'), false);
  assert.match(summaryOf(plan), /1 to write/);
});
test('arguments, exit codes, names', () => {
  assert.deepEqual(parseArgs(['--out=x']), { mode: 'trial', out: 'x' });
  assert.deepEqual(parseArgs(['--apply', '--tenant=scs', '--plan=p']), { mode: 'apply', tenant: 'scs', plan: 'p' });
  assert.throws(() => parseArgs([]), /--out/);
  assert.throws(() => parseArgs(['--apply', '--undo', '--tenant=s', '--plan=p']), /one of/);
  assert.throws(() => parseArgs(['--undo']), /--tenant=<id> and --plan=<file>/);
  assert.throws(() => parseArgs(['--force']), /unknown/);
  assert.equal(exitCodeOf([]), 0);
  assert.equal(exitCodeOf([['a', 'x']]), 2);
  assert.equal(skipSummary([['a', 'x'], ['b', 'x']]), 'Skipped: x 2');
  assert.equal(backupName('apply', 'sc/s', '2026-11-27T10:00:00.000Z'), 'backup-apply-scs-2026-11-27T10-00-00-000Z.json');
});
