/**
 * The pure part of migrate-article-blocks.ts (spec 1.173 §11): arguments, plan, comparison of the public output, reports.
 * What decides about a single document is in libs/shared/models/src/lib/article-migration.util.ts. It lives here and not
 * in a lib because it compares the output of `cms-website-render` and of the news API of the functions.
 */
import { isDeepStrictEqual } from 'node:util';
import { columnPairStarts, homeRowPlan, mapSection, type SectionDoc } from '@okr/cms-website-render';
import {
  blocksFromClassic, drawnArticle, planArticleMigration, withClassicFields, withMigrationPatch,
  type ArticleMigration, type ArticleMigrationPatch, type ArticleShape, type MigratableSection,
} from '@okr/shared-models';
import { sectionToNewsDetail } from '../apps/functions/src/publicApi/routes/news';

export const PLAN_VERSION = 1;
const NO_TENANT = '(none)';

/** A section document as stored; nothing about it is trusted. */
export type StoredSection = MigratableSection & { name?: unknown; title?: unknown };

type LeaveReason = Extract<ArticleMigration, { action: 'leave' }>['reason'] | 'public-output-differs';
interface EntryBase {
  key: string; name: string; title: string; tenants: string[];
  /** used by several tenants: one write serves them all */
  shared: boolean;
  /** `contentI18n.de` is not the German text (which wins); for the report only */
  germanDiffers: boolean;
}
export type MigrateEntry = EntryBase & { action: 'migrate'; shape: ArticleShape; updateTime: string; patch: ArticleMigrationPatch };
/** `detail`: names of fields or places that differ, never their values */
export type LeaveEntry = EntryBase & { action: 'leave'; reason: LeaveReason; detail: string };
export type PlanEntry = MigrateEntry | LeaveEntry;
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

/** A Firestore update time, exact and comparable after JSON. */
export function updateTimeOf(t: { seconds: number; nanoseconds: number }): string {
  return `${t.seconds}.${String(t.nanoseconds).padStart(9, '0')}`;
}

export function planDocument(key: string, data: StoredSection, updateTime: string): PlanEntry {
  const tenants = Array.isArray(data.tenants) ? data.tenants.filter((t) => typeof t === 'string') : [];
  const base: EntryBase = { key, name: text(data.name), title: text(data.title), tenants, shared: tenants.length > 1, germanDiffers: germanDiffers(data) };
  const plan = planArticleMigration(data);
  if (plan.action === 'leave') return { ...base, ...plan, detail: plan.reason === 'not-identical' ? whyNotIdentical(data) : '' };
  const differences = publicDifferences(key, data, withMigrationPatch(data, plan.patch));
  if (differences.length > 0) return { ...base, action: 'leave', reason: 'public-output-differs', detail: differences.join('; ') };
  return { ...base, ...plan, updateTime };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function propertiesOf(data: StoredSection): Record<string, unknown> {
  return (data.properties ?? {}) as Record<string, unknown>;
}

function germanDiffers(data: StoredSection): boolean {
  const german = (propertiesOf(data)['contentI18n'] as { de?: unknown } | null | undefined)?.de;
  return typeof german === 'string' && german !== (data.content?.htmlContent ?? '');
}

/** The fields that are drawn differently after the conversion, for the report. */
function whyNotIdentical(data: StoredSection): string {
  const p = propertiesOf(data);
  const images: unknown = p['images'] ?? [];
  if (!Array.isArray(images) || images.some((i) => typeof i !== 'object' || i === null)) return 'malformed data';
  if (p['cover'] !== undefined) return 'cover without blocks';
  const withoutUrl = images.filter((i: { url?: unknown }) => text(i.url).trim() === '').length;
  if (withoutUrl > 0) return `image without url: ${withoutUrl} of ${images.length}, position ${Number(data.content?.position ?? 0)}`;
  const fields = differingKeys(drawnArticle(data), drawnArticle(withClassicFields({ ...data, content: undefined, properties: blocksFromClassic(data) })));
  return fields.join(', ') || 'malformed data';
}

/** The top-level keys whose values differ, as they are in JSON. */
function differingKeys(a: object, b: object): string[] {
  const [left, right] = [json(a), json(b)];
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => !isDeepStrictEqual(left[key], right[key])).sort();
}

function json(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function buildPlan(docs: [key: string, data: StoredSection, updateTime: { seconds: number; nanoseconds: number }][], createdAt: string, projectId: string): Plan {
  const entries = docs.map(([key, data, updateTime]) => planDocument(key, data, updateTimeOf(updateTime)));
  return { version: PLAN_VERSION, projectId, createdAt, entries: entries.sort((a, b) => (a.key < b.key ? -1 : 1)) };
}

export function parsePlan(content: string, projectId: string): Plan {
  let plan: Partial<Plan> | null = null;
  try { plan = JSON.parse(content) as Partial<Plan> | null; } catch { /* reported below */ }
  if (plan?.version !== PLAN_VERSION || !Array.isArray(plan.entries)) throw new Error('this is not a plan of this script');
  if (plan.projectId !== projectId) throw new Error(`the plan is of the project ${plan.projectId}, not ${projectId}`);
  return plan as Plan;
}

/** The articles that a run for this tenant writes; a shared one belongs to each of its tenants. */
export function entriesOf(plan: Plan, tenant: string): MigrateEntry[] {
  return plan.entries.filter((e): e is MigrateEntry => e.action === 'migrate' && e.tenants.includes(tenant));
}

// ------------------------------------------------- comparison of the public output ------------------------------------------------

/** Stricter than the real sanitizer: what differs unsanitized counts as different. */
const unsanitized = (html: string): string => html;
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

/**
 * Where the website and the news API show the article differently after the migration, without any value: the mapped
 * section in all languages, alone and inside an accordion, its place in the home layout, the news detail (which includes
 * the summary). An error counts as a difference.
 */
export function publicDifferences(key: string, original: StoredSection, migrated: StoredSection): string[] {
  const found: string[] = [];
  const compare = (place: string, show: (s: SectionDoc) => object): void => {
    try {
      const fields = differingKeys(show(original as SectionDoc), show(migrated as SectionDoc));
      if (fields.length > 0) found.push(place === 'home layout' ? place : `${place}: ${fields.join(', ')}`);
    } catch {
      found.push(`${place}: error`);
    }
  };
  for (const lang of langsOf(original)) {
    compare(`website ${lang}`, (s) => mapped(key, s, lang));
    compare(`accordion ${lang}`, (s) => mapSection('accordion', ACCORDION(key), new Map([[key, s]]), unsanitized, lang) as object);
  }
  compare('home layout', (s) => homePlace(mapped(key, s, 'de')));
  compare('news', (s) => sectionToNewsDetail({ okey: key, ...s } as unknown as Parameters<typeof sectionToNewsDetail>[0], unsanitized));
  return found;
}

const ACCORDION = (key: string): SectionDoc => ({ type: 'accordion', properties: { items: [{ key, label: '' }] } });

function langsOf(s: StoredSection): string[] {
  const i18n = propertiesOf(s)['contentI18n'];
  return [...new Set([...LANGS, ...(typeof i18n === 'object' && i18n !== null ? Object.keys(i18n) : [])])];
}

/** The mapped section without the values that no template reads (the rule of section-mapper.spec.ts). */
function mapped(key: string, s: SectionDoc, lang: string): Record<string, unknown> {
  const out = { ...(mapSection(key, s, new Map(), unsanitized, lang) as Record<string, unknown>) };
  if (out['imagePosition'] !== 'left' && out['imagePosition'] !== 'right') delete out['imageColSize'];
  if ((out['images'] as unknown[]).length === 0) delete out['imageHeight'];
  return out;
}

function homePlace(article: Record<string, unknown>): object {
  return {
    row: homeRowPlan([article, { type: 'tiles', variant: 'stat' }]).map((r) => r.kind),
    pair: [...columnPairStarts([article, { type: 'form' }])],
  };
}

// ------------------------------------------------- reports (Markdown; section key, name and title only) ------------------------------------------------

export function tenantsOf(plan: Plan): string[] {
  return [...new Set(plan.entries.flatMap(tenantsOfEntry))].sort();
}

function tenantsOfEntry(e: PlanEntry): string[] {
  return e.tenants.length > 0 ? e.tenants : [NO_TENANT];
}

export function reportOf(plan: Plan, tenant: string): string {
  const entries = plan.entries.filter((e) => tenantsOfEntry(e).includes(tenant));
  return page([
    `# Article migration, trial run: ${tenant}`,
    `${plan.createdAt} · project ${plan.projectId} · read only`,
    ...overview(entries),
    ...list('Left out', entries.filter(isLeave), (e) => ` — ${e.reason}${e.detail ? ` (${e.detail})` : ''}`),
    ...list('Hidden images that become the cover', entries.filter((e) => isMigrate(e) && e.shape === 'cover')),
    ...list('German translation differs from the German text', entries.filter((e) => e.germanDiffers)),
    ...list('Shared with other tenants', entries.filter((e) => e.shared), (e) => ` (${[...e.tenants].sort().join(', ')})`),
  ]);
}

export function summaryOf(plan: Plan): string {
  const tenants = tenantsOf(plan).map((tenant) => {
    const entries = plan.entries.filter((e) => tenantsOfEntry(e).includes(tenant));
    return [tenant, entries.length, entries.filter(isMigrate).length, entries.filter(isLeave).length, entries.filter((e) => e.shared).length];
  });
  return page([
    '# Article migration, trial run: all tenants',
    `${plan.createdAt} · project ${plan.projectId} · read only · a shared article counts once here, and at each of its tenants below`,
    ...overview(plan.entries),
    `Hidden images that become the cover: ${plan.entries.filter((e) => isMigrate(e) && e.shape === 'cover').length}`,
    `German translation differs from the German text: ${plan.entries.filter((e) => e.germanDiffers).length}`,
    '## Tenants',
    table(['Tenant', 'Articles', 'Migrate', 'Left out', 'Shared'], tenants),
  ]);
}

const isMigrate = (e: PlanEntry): e is MigrateEntry => e.action === 'migrate';
const isLeave = (e: PlanEntry): e is LeaveEntry => e.action === 'leave';

function overview(entries: PlanEntry[]): string[] {
  const [migrate, leave] = [entries.filter(isMigrate), entries.filter(isLeave)];
  return [
    `${entries.length} articles, ${migrate.length} to migrate, ${leave.length} left out, ${entries.filter((e) => e.shared).length} shared`,
    table(['Shape', 'Articles'], count(migrate.map((e) => e.shape))),
    table(['Left out because', 'Articles'], count(leave.map((e) => e.reason))),
  ];
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

function list<T extends PlanEntry>(title: string, entries: T[], suffix: (e: T) => string = () => ''): string[] {
  if (entries.length === 0) return [];
  return [`## ${title} (${entries.length})`, entries.map((e) => `- \`${e.key}\` · ${shown(e.name, 'name')} · ${shown(e.title, 'title')}${suffix(e)}`).join('\n')];
}

function shown(value: string, what: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[\\`*_|<>[\]#]/g, '\\$&') || `(no ${what})`;
}

function page(parts: string[]): string {
  return `${parts.filter((part) => part !== '').join('\n\n')}\n`;
}
