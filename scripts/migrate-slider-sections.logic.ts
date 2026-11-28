/**
 * The pure part of migrate-slider-sections.ts (spec 1.182 §6): plan, apply/undo checks, reports.
 * The conversion itself is `sliderToArticle` (cms-section-util), the one the section editor uses since phase A.
 * Arguments, file names, the private-directory guard and the comparison of the public output are those of
 * migrate-article-blocks.
 */
import { isDeepStrictEqual } from 'node:util';
import { IMAGE_STYLE_SHAPE, type SliderSection } from '@okr/shared-models';
import { sliderToArticle } from '../libs/cms/section/util/src/lib/slider-article.util';
import { columnPairStarts, homeRowPlan, mapSection, type SectionDoc } from '@okr/cms-website-render';
import { sectionToNewsDetail } from '../apps/functions/src/publicApi/routes/news';
import { updateTimeOf, type StoredSection } from './migrate-article-blocks.logic';

export { parseArgs, updateTimeOf, exitCodeOf, skipSummary, reportName, backupName, privateNames } from './migrate-article-blocks.logic';

export const PLAN_VERSION = 1;
export const PLAN_KIND = 'slider-sections';
const NO_TENANT = '(none)';

/** A slider document as stored; nothing about it is trusted. */
export type StoredSlider = StoredSection & { type?: unknown; properties?: unknown };

/** The two fields the migration writes; everything else of the document stays. */
export interface SliderPatch { type: 'article'; properties: Record<string, unknown> }

/** Where a slider is shown publicly; only there must the output stay the same. */
export interface Usage {
  /** shown on a page that is in the tree of a live website */
  website: boolean;
  /** an item of an accordion section */
  accordion: boolean;
  /** on a tenant's news page (`news_<tenant>`) */
  news: boolean;
}
export const UNUSED: Usage = { website: false, accordion: false, news: false };

interface EntryBase { key: string; name: string; title: string; tenants: string[]; shared: boolean; usage: Usage }
export type MigrateEntry = EntryBase & {
  action: 'migrate'; updateTime: string; images: number;
  /** the stored imageStyle draws a border or a corner radius, which the article carousel does not (spec §4) */
  framed: boolean;
  /** what undo writes back */
  original: unknown;
  patch: SliderPatch;
};
export type LeaveReason = 'no-images' | 'public-output-differs' | 'error';
export type LeaveEntry = EntryBase & { action: 'leave'; reason: LeaveReason; detail: string };
export type PlanEntry = MigrateEntry | LeaveEntry;
export interface Plan { version: number; kind: string; projectId: string; createdAt: string; entries: PlanEntry[] }

// ------------------------------------------------- planning ------------------------------------------------

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function propertiesOf(data: StoredSlider): Record<string, unknown> {
  return typeof data.properties === 'object' && data.properties !== null ? data.properties as Record<string, unknown> : {};
}

/** The article a slider becomes: type and properties only. */
export function sliderPatch(data: StoredSlider): SliderPatch {
  const article = sliderToArticle(data as unknown as SliderSection);
  return json({ type: 'article', properties: article.properties }) as unknown as SliderPatch;
}

/** The style the slider drew (stored values over the defaults) has a border or a corner radius. */
export function isFramed(data: StoredSlider): boolean {
  const stored = propertiesOf(data)['imageStyle'];
  const style = { ...IMAGE_STYLE_SHAPE, ...(typeof stored === 'object' && stored !== null ? stored : {}) } as Record<string, unknown>;
  const none = (value: unknown): boolean => /^(|none|0|0px|0 solid|0px solid)$/.test(text(value).trim());
  return !none(style['border']) || !none(style['borderRadius']);
}

export function planSlider(key: string, data: StoredSlider, updateTime: string, usage: Usage = UNUSED): PlanEntry {
  const tenants = Array.isArray(data.tenants) ? data.tenants.filter((t): t is string => typeof t === 'string') : [];
  const base: EntryBase = { key, name: text(data.name), title: text(data.title), tenants, shared: tenants.length > 1, usage };
  const images = propertiesOf(data)['images'];
  if (!Array.isArray(images) || images.length === 0) return { ...base, action: 'leave', reason: 'no-images', detail: '' };
  let patch: SliderPatch;
  try {
    patch = sliderPatch(data);
  } catch {
    return { ...base, action: 'leave', reason: 'error', detail: 'conversion failed' };
  }
  const differences = publicDifferences(key, data, { ...data, ...patch } as StoredSlider, usage);
  if (differences.length > 0) return { ...base, action: 'leave', reason: 'public-output-differs', detail: differences.join('; ') };
  return { ...base, action: 'migrate', updateTime, images: images.length, framed: isFramed(data), original: json(data.properties ?? null), patch };
}

export function buildPlan(
  docs: [key: string, data: StoredSlider, updateTime: { seconds: number; nanoseconds: number }][], createdAt: string, projectId: string,
  usageOf: (key: string) => Usage = () => UNUSED,
): Plan {
  const entries = docs.map(([key, data, updateTime]) => planSlider(key, data, updateTimeOf(updateTime), usageOf(key)));
  return { version: PLAN_VERSION, kind: PLAN_KIND, projectId, createdAt, entries: entries.sort((a, b) => (a.key < b.key ? -1 : 1)) };
}

export function parsePlan(content: string, projectId: string): Plan {
  let plan: Partial<Plan> | null = null;
  try { plan = JSON.parse(content) as Partial<Plan> | null; } catch { /* reported below */ }
  if (plan?.version !== PLAN_VERSION || plan.kind !== PLAN_KIND || !Array.isArray(plan.entries)) throw new Error('this is not a plan of this script');
  if (plan.projectId !== projectId) throw new Error(`the plan is of the project ${plan.projectId}, not ${projectId}`);
  const keys = new Set<string>();
  plan.entries.forEach((entry: unknown, i) => {
    const problem = entryProblem(entry) ?? (keys.has((entry as PlanEntry).key) ? 'the key is given twice' : undefined);
    if (problem) throw new Error(`entry ${i + 1} of the plan: ${problem}`);
    keys.add((entry as PlanEntry).key);
  });
  return plan as Plan;
}

function entryProblem(e: unknown): string | undefined {
  if (!isObject(e)) return 'no object';
  const { action, key, tenants, updateTime, patch } = e;
  if (action !== 'migrate' && action !== 'leave') return 'invalid action';
  if (typeof key !== 'string' || key === '' || key.includes('/') || /^(\.\.?|__.*__)$/.test(key)) return 'invalid key';
  if (!Array.isArray(tenants) || !tenants.every((t) => typeof t === 'string')) return 'invalid tenants';
  if (action === 'leave') return undefined;
  if (typeof updateTime !== 'string' || !/^\d+\.\d{9}$/.test(updateTime)) return 'invalid updateTime';
  if (!isObject(patch) || patch['type'] !== 'article' || !isObject(patch['properties']) || Object.keys(patch).length !== 2) return 'invalid patch';
  const blocks = patch['properties']['blocks'];
  if (!Array.isArray(blocks) || blocks.length !== 1 || !isObject(blocks[0]) || blocks[0]['type'] !== 'gallery') return 'invalid patch.properties.blocks';
  return 'original' in e ? undefined : 'no original';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** The sliders a run for this tenant writes; a shared one belongs to each of its tenants. */
export function entriesOf(plan: Plan, tenant: string): MigrateEntry[] {
  return plan.entries.filter((e): e is MigrateEntry => e.action === 'migrate' && e.tenants.includes(tenant));
}

// ------------------------------------------------- comparison of the public output ------------------------------------------------

/** Stricter than the real sanitizer: what differs unsanitized counts as different. */
const unsanitized = (html: string): string => html;
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

/**
 * Where the website and the news API show the slider differently as an article, without any value. A slider is mapped as
 * a classic article; the article as a free one, which carries the same keys plus `hasBlocks` and its `blocks`. So the two
 * must be equal without those, and the blocks must be exactly one gallery in the carousel layout that shows the classic
 * images at the classic height. Checked in all languages, alone and inside an accordion, for the home layout and the news
 * detail. An error counts as a difference.
 */
export function publicDifferences(key: string, original: StoredSlider, migrated: StoredSlider, usage: Usage = { website: true, accordion: true, news: true }): string[] {
  const found: string[] = [];
  const compare = (place: string, show: (s: SectionDoc) => Record<string, unknown>): void => {
    try {
      const [before, after] = [json(show(original as SectionDoc)), json(show(migrated as SectionDoc))] as Record<string, unknown>[];
      const fields = freeDifferences(before, after);
      if (fields.length > 0) found.push(place === 'home layout' ? place : `${place}: ${fields.join(', ')}`);
    } catch {
      found.push(`${place}: error`);
    }
  };
  for (const lang of LANGS) {
    if (usage.website) compare(`website ${lang}`, (s) => mapped(key, s, lang));
    if (usage.accordion) compare(`accordion ${lang}`, (s) => {
      const out = mapSection('accordion', ACCORDION(key), new Map([[key, s]]), unsanitized, lang) as unknown as { items?: Record<string, unknown>[] };
      return (out.items ?? [])[0] ?? {};
    });
  }
  if (usage.website) compare('home layout', (s) => homePlace(mapped(key, s, 'de')));
  if (usage.news) compare('news', (s) => sectionToNewsDetail({ okey: key, ...s } as unknown as Parameters<typeof sectionToNewsDetail>[0], unsanitized) as unknown as Record<string, unknown>);
  return found;
}

/** The keys in which the free article differs from the classic one; '(gallery)' when its blocks are not the classic images. */
function freeDifferences(classic: Record<string, unknown>, free: Record<string, unknown>): string[] {
  const { hasBlocks, blocks, ...rest } = free;
  const found = differingKeys(classic, rest);
  if (hasBlocks === undefined && blocks === undefined) return found;
  const gallery = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] as Record<string, unknown> : undefined;
  const same = hasBlocks === true && gallery?.['type'] === 'gallery' && gallery['layout'] === 'slider'
    && isDeepStrictEqual(gallery['images'], classic['images'] ?? []) && (classic['imageHeight'] === undefined || gallery['imageHeight'] === classic['imageHeight']);
  return same ? found : [...found, '(gallery)'];
}

function differingKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !isDeepStrictEqual(a[key], b[key])).sort();
}

const ACCORDION = (key: string): SectionDoc => ({ type: 'accordion', properties: { items: [{ key, label: '' }] } });

/** The mapped section without the values that no template reads (the rule of section-mapper.spec.ts). */
function mapped(key: string, s: SectionDoc, lang: string): Record<string, unknown> {
  const out = { ...(mapSection(key, s, new Map(), unsanitized, lang) as Record<string, unknown>) };
  if (out['imagePosition'] !== 'left' && out['imagePosition'] !== 'right') delete out['imageColSize'];
  if (!Array.isArray(out['images']) || out['images'].length === 0) delete out['imageHeight'];
  return out;
}

function homePlace(article: Record<string, unknown>): Record<string, unknown> {
  return {
    row: homeRowPlan([article, { type: 'tiles', variant: 'stat' }]).map((r) => r.kind),
    pair: [...columnPairStarts([article, { type: 'form' }])],
  };
}

// ------------------------------------------------- where the sliders are shown ------------------------------------------------

interface PageDoc { key: string; sections?: unknown; tenants?: unknown; isArchived?: unknown }
interface TreeNode { type?: unknown; pageKey?: unknown; isArchived?: unknown; children?: unknown }
interface WebsiteDoc { nav?: unknown; footer?: unknown; isArchived?: unknown }
interface AccordionDoc { properties?: unknown; tenants?: unknown; isArchived?: unknown }

/** The section keys a list refers to, with `@TID@` resolved for each tenant of the referring document. */
function keysOf(list: unknown, tenants: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const ids = Array.isArray(tenants) ? tenants.filter((t): t is string => typeof t === 'string') : [];
  return list.filter((k): k is string => typeof k === 'string').flatMap((k) => (k.includes('@TID@') ? ids.map((t) => k.replace('@TID@', t)) : [k]));
}

function pagesInTree(nodes: unknown, into: Set<string>): void {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes as TreeNode[]) {
    if (!n || n.isArchived === true) continue;
    if (n.type === 'page' && typeof n.pageKey === 'string') into.add(n.pageKey);
    pagesInTree(n.children, into);
  }
}

/** Where each section key is shown publicly. Archived pages, websites and accordions do not count. */
export function usageFinder(pages: PageDoc[], websites: WebsiteDoc[], accordions: AccordionDoc[]): (key: string) => Usage {
  const sitePages = new Set<string>();
  for (const site of websites) if (site.isArchived !== true) { pagesInTree(site.nav, sitePages); pagesInTree(site.footer, sitePages); }
  const website = new Set<string>();
  const news = new Set<string>();
  for (const page of pages) {
    if (page.isArchived === true) continue;
    const keys = keysOf(page.sections, page.tenants);
    if (sitePages.has(page.key)) keys.forEach((k) => website.add(k));
    if (page.key.startsWith('news_')) keys.forEach((k) => news.add(k));
  }
  const accordion = new Set<string>();
  for (const a of accordions) {
    if (a.isArchived === true) continue;
    const items = (a.properties as { items?: unknown } | undefined)?.items;
    const keys = Array.isArray(items) ? items.map((i: { key?: unknown } | null) => i?.key) : [];
    keysOf(keys, a.tenants).forEach((k) => accordion.add(k));
  }
  return (key) => ({ website: website.has(key), accordion: accordion.has(key), news: news.has(key) });
}

// ------------------------------------------------- the checks right before a write ------------------------------------------------

export type ApplySkip = 'missing' | 'other-tenant' | 'not-a-slider' | 'changed-since-trial' | 'patch-differs';
export type UndoSkip = 'missing' | 'other-tenant' | 'not-migrated' | 'edited';

/** Why the slider must not be converted now; `undefined` = write the patch. */
export function applySkip(entry: MigrateEntry, live: { section: StoredSlider; updateTime: string } | undefined, tenant: string): ApplySkip | undefined {
  if (!live) return 'missing';
  if (!Array.isArray(live.section.tenants) || !live.section.tenants.includes(tenant)) return 'other-tenant';
  if (live.section.type !== 'slider') return 'not-a-slider';
  if (live.updateTime !== entry.updateTime) return 'changed-since-trial';
  return isDeepStrictEqual(sliderPatch(live.section), entry.patch) ? undefined : 'patch-differs';
}

/** Why the article must not be turned back into the slider; `undefined` = write type 'slider' and the original properties. */
export function undoSkip(entry: MigrateEntry, section: StoredSlider | undefined, tenant: string): UndoSkip | undefined {
  if (!section) return 'missing';
  if (!Array.isArray(section.tenants) || !section.tenants.includes(tenant)) return 'other-tenant';
  if (section.type !== 'article') return 'not-migrated';
  return isDeepStrictEqual(json(section.properties ?? null), entry.patch.properties) ? undefined : 'edited';
}

// ------------------------------------------------- reports (Markdown; section key, name and title only) ------------------------------------------------

export function tenantsOf(plan: Plan): string[] {
  return [...new Set(plan.entries.flatMap(tenantsOfEntry))].sort();
}

function tenantsOfEntry(e: PlanEntry): string[] {
  return e.tenants.length > 0 ? e.tenants : [NO_TENANT];
}

const isMigrate = (e: PlanEntry): e is MigrateEntry => e.action === 'migrate';
const isLeave = (e: PlanEntry): e is LeaveEntry => e.action === 'leave';

export function reportOf(plan: Plan, tenant: string): string {
  const entries = plan.entries.filter((e) => tenantsOfEntry(e).includes(tenant));
  return page([
    `# Slider migration, trial run: ${tenant}`,
    `${plan.createdAt} · project ${plan.projectId} · read only`,
    overview(entries),
    ...list('To migrate', entries.filter(isMigrate), (e) => ` — ${e.images} images${e.framed ? ', border or radius' : ''}${shownAt(e)}`),
    ...list('Left out', entries.filter(isLeave), (e) => ` — ${e.reason}${e.detail ? ` (${e.detail})` : ''}${shownAt(e)}`),
    ...list('Shared with other tenants', entries.filter((e) => e.shared), (e) => ` (${[...e.tenants].sort().join(', ')})`),
  ]);
}

export function summaryOf(plan: Plan): string {
  const rows = tenantsOf(plan).map((tenant) => {
    const entries = plan.entries.filter((e) => tenantsOfEntry(e).includes(tenant));
    const migrate = entries.filter(isMigrate);
    return [tenant, entries.length, migrate.length, entries.filter(isLeave).length, entries.filter((e) => e.usage?.website).length, migrate.filter((e) => e.framed).length, entries.filter((e) => e.shared).length];
  });
  return page([
    '# Slider migration, trial run: all tenants',
    `${plan.createdAt} · project ${plan.projectId} · read only · a shared slider counts once here, and at each of its tenants below`,
    overview(plan.entries),
    '## Tenants',
    table(['Tenant', 'Sliders', 'Migrate', 'Left out', 'On a website', 'Border or radius', 'Shared'], rows),
  ]);
}

function shownAt(e: PlanEntry): string {
  const at = (['website', 'accordion', 'news'] as const).filter((place) => e.usage?.[place]);
  return at.length > 0 ? `; public: ${at.join(', ')}` : '; not public';
}

function overview(entries: PlanEntry[]): string {
  const leave = entries.filter(isLeave);
  const reasons = count(leave.map((e) => e.reason)).map(([r, n]) => `${r} ${n}`).join(', ');
  return `${entries.length} sliders, ${entries.filter(isMigrate).length} to migrate, ${leave.length} left out${reasons ? ` (${reasons})` : ''}`;
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
