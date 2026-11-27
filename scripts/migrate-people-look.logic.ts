/**
 * The pure part of migrate-people-look.ts (spec 1.181, design 2026-11-27-people-block-editor §6.3, §8): arguments, the plan
 * of one people section, the comparison of the website output, reports and the guards of apply and undo.
 */
import { isDeepStrictEqual } from 'node:util';
import { mapSection, peopleSourceKey, peopleSourceOf, type SectionDoc } from '@okr/cms-website-render';
import { cleanPeopleConfig, peopleHiddenKeys, type PeopleConfig } from '@okr/shared-models';

export const PLAN_VERSION = 1;
const NO_TENANT = '(none)';
const LANGS = ['de', 'en', 'fr', 'es', 'it'];
/** The avatar fields that are the look (old and new): a section that has none of them draws with the defaults and keeps its avatar. */
const LOOK_FIELDS = [
  'imgWidth', 'imgHeight', 'imgRadius', 'facePad', 'background', 'bgOrgColor', 'bgColors', 'color',
  'perRow', 'sliderRows', 'infoPosition', 'showName', 'showLabel', 'size', 'shape', 'fill', 'textPosition',
];

/** A section document as stored; nothing about it is trusted. */
export interface StoredPeopleSection { type?: unknown; name?: unknown; tenants?: unknown; properties?: unknown }

export type PeopleMigration =
  | { action: 'write'; patch: Partial<PeopleConfig> }
  | { action: 'leave'; reason: 'not-people' | 'nothing-to-do' | 'website-output-differs' };

/** `patch` is the complete new `properties` (it replaces them); `before` the stored ones, for undo and the owner's diff. */
export type WriteEntry = {
  action: 'write'; key: string; name: string; tenants: string[]; shared: boolean; updateTime: string;
  patch: Partial<PeopleConfig>; before: Record<string, unknown>; changes: string[];
};
export type LeaveEntry = { action: 'leave'; key: string; name: string; tenants: string[]; shared: boolean; reason: string };
export type PlanEntry = WriteEntry | LeaveEntry;
export interface Plan { version: number; projectId: string; createdAt: string; entries: PlanEntry[] }

// ------------------------------------------------- arguments ------------------------------------------------

export type Args = { mode: 'trial'; out: string } | { mode: 'apply' | 'undo'; tenant: string; plan: string };

export function parseArgs(argv: string[]): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (const arg of argv) {
    const [, name, value] = /^--(out|tenant|plan)=(.*)$/.exec(arg) ?? [];
    if (!name && arg !== '--apply' && arg !== '--undo') throw new Error(`unknown argument ${arg}`);
    if (name && values.has(name)) throw new Error(`--${name} is given twice`);
    if (name) values.set(name, value);
    else flags.add(arg);
  }
  const [out, tenant, plan] = ['out', 'tenant', 'plan'].map((name) => values.get(name));
  if (flags.size > 1) throw new Error('give one of --apply and --undo');
  if (flags.size === 0) {
    if (tenant !== undefined || plan !== undefined) throw new Error('--tenant and --plan are used only with --apply or --undo');
    if (!out) throw new Error('a trial run needs --out=<directory>');
    return { mode: 'trial', out };
  }
  if (out !== undefined) throw new Error('--out is used only in a trial run');
  if (!tenant || !plan) throw new Error('--apply and --undo need both --tenant=<id> and --plan=<file>');
  return { mode: flags.has('--apply') ? 'apply' : 'undo', tenant, plan };
}

// ------------------------------------------------- planning ------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keysOf(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => (typeof item === 'string' ? [item] : isObject(item) && typeof item['key'] === 'string' ? [item['key']] : [])).filter((k) => k !== '');
}

/** The new `properties` of a people section (before the comparison with the website). */
function cleaned(props: Record<string, unknown>): Record<string, unknown> {
  const config = { ...props } as unknown as PeopleConfig;
  // a legacy single responsibilityId is read only while responsibilityIds is empty (both readers): fold it then,
  // otherwise it is inert and dropped below
  if (config.type === 'responsibility' && typeof config.responsibilityId === 'string' && config.responsibilityId.trim() !== '') {
    const ids = Array.isArray(config.responsibilityIds) ? config.responsibilityIds.filter((i) => typeof i === 'string' && i.trim() !== '') : [];
    if (ids.length === 0) config.responsibilityIds = [config.responsibilityId.trim()];
  }
  // the migration has no resolved persons: no stale override key is dropped, nothing is lost
  const shown = [...new Set([...peopleHiddenKeys(config), ...keysOf(config.hiddenKeys), ...keysOf(config.excludedPersons), ...keysOf(config.orderKeys)])];
  const out = cleanPeopleConfig(config, shown) as unknown as Record<string, unknown>;
  const avatar = props['avatar'];
  // folded into responsibilityIds above (cleanPeopleConfig keeps it for this source)
  delete out['responsibilityId'];
  // untouched look: a section that never stored any look field draws with the defaults and stays as it is
  if (!isObject(avatar) || !LOOK_FIELDS.some((f) => f in avatar)) {
    if (avatar === undefined) delete out['avatar'];
    else out['avatar'] = avatar;
  }
  // do not invent an empty list
  if (!('persons' in props) && Array.isArray(out['persons']) && out['persons'].length === 0) delete out['persons'];
  return out;
}

export function planPeopleMigration(section: StoredPeopleSection): PeopleMigration {
  const props = section.properties;
  if (section.type !== 'people' || !isObject(props) || !['persons', 'group', 'responsibility'].includes(props['type'] as string)) {
    return { action: 'leave', reason: 'not-people' };
  }
  const patch = cleaned(props);
  if (isDeepStrictEqual(json(patch), json(props))) return { action: 'leave', reason: 'nothing-to-do' };
  if (websiteDiffers(section, patch)) return { action: 'leave', reason: 'website-output-differs' };
  return { action: 'write', patch: patch as unknown as Partial<PeopleConfig> };
}

function json(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

/** Names of the fields that differ: added, removed, changed (never their values), for the owner's diff. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const name of names) {
    const [a, b] = [before[name], after[name]];
    if (name === 'avatar' && isObject(a) && isObject(b)) {
      const sub = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter((k) => !isDeepStrictEqual(json(a[k]), json(b[k])));
      out.push(...sub.map((k) => `avatar.${k}`));
    } else if (!isDeepStrictEqual(json(a), json(b))) out.push(name);
  }
  return out;
}

// ------------------------------------------------- comparison of the website output ------------------------------------------------

const stubPeople = (seed: string, extraKeys: string[]): { key: string; firstName: string; lastName: string; label: string; showImage: boolean; image: string; email: string }[] =>
  [...new Set([...['a', 'b', 'c'].map((k) => `${seed}-${k}`), ...extraKeys])].map((k) => ({
    key: k, firstName: `F${k}`, lastName: `L${k}`, label: `Label ${k}`, showImage: true, image: `avatars/${k}.jpg`, email: `${k}@example.ch`,
  }));

/**
 * The mapped section before and after with the persons resolved the same (the same stub for the source before and after,
 * which differ only in the key of a folded legacy `responsibilityId`). The 4px → 5px radius is not drawn there.
 */
export function websiteDiffers(section: StoredPeopleSection, patch: Record<string, unknown>): boolean {
  const make = (properties: unknown): SectionDoc => ({ type: 'people', name: section.name, properties } as unknown as SectionDoc);
  const [before, after] = [make(section.properties), make(patch)];
  // different people per source key, plus the keys the section hides or orders: a changed source, hide or order shows up
  const props = section.properties as Record<string, unknown>;
  const extra = [...new Set([...keysOf(props['hiddenKeys']), ...keysOf(props['excludedPersons']), ...keysOf(props['orderKeys'])])];
  const people = new Map<string, ReturnType<typeof stubPeople>>();
  for (const doc of [before, after]) {
    const source = peopleSourceOf(doc);
    if (source) people.set(peopleSourceKey(source), stubPeople(peopleSourceKey(source), extra));
  }
  try {
    return LANGS.some((lang) => {
      const show = (doc: SectionDoc): unknown => json(mapSection('k', doc, new Map(), (html) => html, lang, people));
      return !isDeepStrictEqual(show(before), show(after));
    });
  } catch {
    return true;
  }
}

// ------------------------------------------------- plan file ------------------------------------------------

export function updateTimeOf(t: { seconds: number; nanoseconds: number }): string {
  return `${t.seconds}.${String(t.nanoseconds).padStart(9, '0')}`;
}

export function planDocument(key: string, data: StoredPeopleSection, updateTime: string): PlanEntry {
  const tenants = Array.isArray(data.tenants) ? data.tenants.filter((t): t is string => typeof t === 'string') : [];
  const base = { key, name: typeof data.name === 'string' ? data.name : '', tenants, shared: tenants.length > 1 };
  const plan = planPeopleMigration(data);
  if (plan.action === 'leave') return { ...base, action: 'leave', reason: plan.reason };
  const before = data.properties as Record<string, unknown>;
  return { ...base, action: 'write', updateTime, patch: plan.patch, before, changes: changedFields(before, plan.patch as Record<string, unknown>) };
}

export function buildPlan(docs: [key: string, data: StoredPeopleSection, updateTime: { seconds: number; nanoseconds: number }][], createdAt: string, projectId: string): Plan {
  const entries = docs.map(([key, data, updateTime]) => planDocument(key, data, updateTimeOf(updateTime)));
  return { version: PLAN_VERSION, projectId, createdAt, entries: entries.sort((a, b) => (a.key < b.key ? -1 : 1)) };
}

export function parsePlan(content: string, projectId: string): Plan {
  let plan: Partial<Plan> | null = null;
  try { plan = JSON.parse(content) as Partial<Plan> | null; } catch { /* reported below */ }
  if (plan?.version !== PLAN_VERSION || !Array.isArray(plan.entries)) throw new Error('this is not a plan of this script');
  if (plan.projectId !== projectId) throw new Error(`the plan is of the project ${plan.projectId}, not ${projectId}`);
  const keys = new Set<unknown>();
  plan.entries.forEach((entry: unknown, i) => {
    const problem = entryProblem(entry) ?? (keys.has((entry as PlanEntry).key) ? 'the key is given twice' : undefined);
    if (problem) throw new Error(`entry ${i + 1} of the plan: ${problem}`);
    keys.add((entry as PlanEntry).key);
  });
  return plan as Plan;
}

function entryProblem(e: unknown): string | undefined {
  if (!isObject(e)) return 'no object';
  const { action, key, tenants, updateTime, patch, before } = e;
  if (action !== 'write' && action !== 'leave') return 'invalid action';
  if (typeof key !== 'string' || key === '' || key.includes('/') || /^(\.\.?|__.*__)$/.test(key)) return 'invalid key';
  if (!Array.isArray(tenants) || !tenants.every((t) => typeof t === 'string')) return 'invalid tenants';
  if (action === 'leave') return undefined;
  if (typeof updateTime !== 'string' || !/^\d+\.\d{9}$/.test(updateTime)) return 'invalid updateTime';
  if (!isObject(patch) || !isObject(before)) return 'invalid patch or before';
  return undefined;
}

/** The sections that a run for this tenant writes; a shared one belongs to each of its tenants. */
export function entriesOf(plan: Plan, tenant: string): WriteEntry[] {
  return plan.entries.filter((e): e is WriteEntry => e.action === 'write' && e.tenants.includes(tenant));
}

// ------------------------------------------------- guards of apply and undo ------------------------------------------------

export interface Current { section: StoredPeopleSection; updateTime: string }

/** Why the section must not be written; `undefined` = write it. */
export function applySkip(entry: WriteEntry, current: Current | undefined, tenant: string): string | undefined {
  if (!current) return 'missing';
  const tenants = Array.isArray(current.section.tenants) ? current.section.tenants : [];
  if (!tenants.includes(tenant)) return 'not-of-tenant';
  if (current.updateTime !== entry.updateTime) return 'changed-since-trial';
  const again = planPeopleMigration(current.section);
  if (again.action === 'leave') return again.reason === 'nothing-to-do' ? 'done' : again.reason;
  return isDeepStrictEqual(json(again.patch), json(entry.patch)) ? undefined : 'patch-differs';
}

/** Undo restores the stored `properties` only where they still are what the apply wrote. */
export function undoSkip(entry: WriteEntry, section: StoredPeopleSection | undefined, tenant: string): string | undefined {
  if (!section) return 'missing';
  const tenants = Array.isArray(section.tenants) ? section.tenants : [];
  if (!tenants.includes(tenant)) return 'not-of-tenant';
  if (isDeepStrictEqual(json(section.properties), json(entry.before))) return 'not-applied';
  return isDeepStrictEqual(json(section.properties), json(entry.patch)) ? undefined : 'edited';
}

export function exitCodeOf(skipped: [key: string, reason: string][]): 0 | 2 {
  return skipped.length > 0 ? 2 : 0;
}

export function skipSummary(skipped: [key: string, reason: string][]): string {
  return skipped.length > 0 ? `Skipped: ${count(skipped.map(([, reason]) => reason)).map(([reason, n]) => `${reason} ${n}`).join(', ')}` : '';
}

// ------------------------------------------------- file names ------------------------------------------------

const fileSafe = (tenant: string): string => tenant.replace(/[^\w-]/g, '');

export function reportName(tenant: string): string {
  return `report-${fileSafe(tenant)}.md`;
}

export function backupName(mode: 'apply' | 'undo', tenant: string, time: string): string {
  return `backup-${mode}-${fileSafe(tenant)}-${time.replace(/[:.]/g, '-')}.json`;
}

export function privateNames(tenant = 'tenant', time = new Date().toISOString()): string[] {
  return ['plan.json', 'summary.md', reportName(tenant), backupName('apply', tenant, time), backupName('undo', tenant, time)];
}

// ------------------------------------------------- reports (section key, name and field names only) ------------------------------------------------

export function tenantsOf(plan: Plan): string[] {
  return [...new Set(plan.entries.flatMap(tenantsOfEntry))].sort();
}

function tenantsOfEntry(e: PlanEntry): string[] {
  return e.tenants.length > 0 ? e.tenants : [NO_TENANT];
}

export function reportOf(plan: Plan, tenant: string): string {
  const entries = plan.entries.filter((e) => tenantsOfEntry(e).includes(tenant));
  const writes = entries.filter((e): e is WriteEntry => e.action === 'write');
  const leaves = entries.filter((e): e is LeaveEntry => e.action === 'leave');
  return page([
    `# People look migration, trial run: ${tenant}`,
    `${plan.createdAt} · project ${plan.projectId} · read only`,
    overview(entries),
    writes.length ? `## To write (${writes.length})\n\n${writes.map((e) => `- \`${e.key}\` · ${shown(e.name)}${e.shared ? ' (shared)' : ''}: ${e.changes.join(', ')}`).join('\n')}` : '',
    leaves.some((e) => e.reason === 'website-output-differs')
      ? `## Left out: the website would draw it differently\n\n${leaves.filter((e) => e.reason === 'website-output-differs').map((e) => `- \`${e.key}\` · ${shown(e.name)}`).join('\n')}`
      : '',
  ]);
}

export function summaryOf(plan: Plan): string {
  const rows = tenantsOf(plan).map((tenant) => {
    const entries = plan.entries.filter((e) => tenantsOfEntry(e).includes(tenant));
    return [tenant, entries.length, entries.filter((e) => e.action === 'write').length, entries.filter((e) => e.action === 'leave' && e.reason === 'website-output-differs').length];
  });
  return page([
    '# People look migration, trial run: all tenants',
    `${plan.createdAt} · project ${plan.projectId} · read only`,
    overview(plan.entries),
    '## Tenants',
    table(['Tenant', 'People sections', 'Write', 'Website differs'], rows),
  ]);
}

function overview(entries: PlanEntry[]): string {
  const writes = entries.filter((e) => e.action === 'write').length;
  const reasons = count(entries.flatMap((e) => (e.action === 'leave' ? [e.reason] : [])));
  return [`${entries.length} sections, ${writes} to write, ${entries.length - writes} left`, table(['Left because', 'Sections'], reasons)].filter((p) => p !== '').join('\n\n');
}

function count(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => (a < b ? -1 : 1));
}

function table(head: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) return '';
  return [head, head.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function shown(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[\\`*_|<>[\]#]/g, '\\$&') || '(no name)';
}

function page(parts: string[]): string {
  return `${parts.filter((part) => part !== '').join('\n\n')}\n`;
}
