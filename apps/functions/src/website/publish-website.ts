// publishWebsite (design §7.2, §8, §11): renders a tenant's public website from Firestore with its
// Handlebars templates and releases it to the site's Firebase Hosting target, all or nothing.
//   auth → lock → load pages + sections → templates → render (validates) → [dry run / problems: stop]
//   → live version → clone its static assets → upload the rendered files → finalize + release
//   → lastPublished* on the site → close the lock.
// The orchestration (runPublish) takes its collaborators as arguments so it is unit-tested without
// Firestore, Storage or Hosting; the callable wires the real ones.
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { PageCollection, WebsiteCollection, type PageModel, type WebsiteModel, type WebsiteNode } from '@okr/shared-models';
import {
  publishedPageSections,
  renderSite,
  toImgixUrl,
  type PublishProblem,
  type RenderInput,
  type RenderResult,
  type SanitizeFn,
  type SectionDoc,
  type TemplateSet,
} from '@okr/cms-website-render';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { getHtmlSanitizer } from '../publicApi/sanitize';
import { cloneStaticAssets, finalizeAndRelease, getLiveVersion, uploadFiles } from './hosting-client';
import { acquireLock, closeLock, type PublishLock, type PublishState } from './publish-lock';
import { loadTemplates, TemplateMissingError } from './template-store';

const REGION = 'europe-west6';
/** Who publishes and rolls back; admin always passes checkRoles. */
export const PUBLISH_ROLES = ['contentAdmin'];
const SAFE_SITE_ID = /^[A-Za-z0-9_-]+$/;
/**
 * Our tenant website Hosting sites, e.g. `scs-website-54aef`. `hostingSite` is server-owned (rules), this
 * is the second layer: publish and rollback never touch another Hosting site (the app's, another project's).
 */
const WEBSITE_HOSTING_SITE = /^[a-z0-9-]+-website-[a-z0-9]+$/;

export function isWebsiteHostingSite(hostingSite: unknown): hostingSite is string {
  return typeof hostingSite === 'string' && WEBSITE_HOSTING_SITE.test(hostingSite);
}

/** What a failed run stores as `detail` on the log doc (readable by contentAdmins): a stage, never error text. */
export type FailureStage = 'load' | 'templates' | 'render' | 'hosting' | 'site';
const SECTIONS = 'sections';
const GET_ALL_CHUNK = 100;
/** Problems kept on the publishes log doc; the response always carries all of them. */
const MAX_LOGGED_PROBLEMS = 100;

export interface PublishWebsiteResult {
  version?: string;
  files: number;
  pages: number;
  durationMs: number;
  problems: PublishProblem[];
}

export interface SiteContent {
  pages: Map<string, PageModel>;
  sections: Map<string, SectionDoc>;
}

export type SitePublishedFields = Partial<Pick<WebsiteModel, 'lastPublishedAt' | 'lastPublishedBy' | 'lastPublishedVersion'>>;

export interface PublishDeps {
  acquireLock(siteId: string, personKey: string, tenants: string[]): Promise<PublishLock | undefined>;
  closeLock(siteId: string, lockId: string, state: Exclude<PublishState, 'running'>, fields: Record<string, unknown>): Promise<void>;
  loadContent(site: WebsiteModel): Promise<SiteContent>;
  loadTemplates(siteId: string, version: string): Promise<TemplateSet>;
  getSanitizer(): Promise<SanitizeFn>;
  renderSite(input: RenderInput): RenderResult;
  getLiveVersion(hostingSite: string): Promise<string | undefined>;
  cloneStaticAssets(hostingSite: string, sourceVersion: string): Promise<string>;
  uploadFiles(version: string, files: RenderResult['files']): Promise<void>;
  finalizeAndRelease(hostingSite: string, version: string, message: string): Promise<string>;
  markPublished(siteId: string, fields: SitePublishedFields): Promise<void>;
  /** epoch ms */
  now(): number;
}

export interface PublishRequest {
  site: WebsiteModel;
  dryRun: boolean;
  personKey: string;
}

function activePageKeys(nodes: WebsiteNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.isArchived) continue;
    if (n.type === 'page' && n.pageKey) out.push(n.pageKey);
    activePageKeys(n.children ?? [], out);
  }
  return out;
}

/** The pages a publish renders: the home page plus every active page node. */
export function renderedPageCount(site: WebsiteModel): number {
  return new Set([site.homePageKey, ...activePageKeys([...(site.nav ?? []), ...(site.footer ?? [])])].filter(Boolean)).size;
}

/**
 * Problems as stored on the log doc: codes and keys only — `detail` (template parse errors, render
 * exceptions) stays in the response and the function log; no undefined fields; bounded in number.
 */
function loggable(problems: PublishProblem[]): Record<string, unknown>[] {
  return problems
    .slice(0, MAX_LOGGED_PROBLEMS)
    .map((p) => Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== 'detail' && v !== undefined)));
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runPublish(deps: PublishDeps, req: PublishRequest): Promise<PublishWebsiteResult> {
  const { site, dryRun, personKey } = req;
  const siteId = site.okey;
  const started = deps.now();
  const pages = renderedPageCount(site);
  const lock = await deps.acquireLock(siteId, personKey, site.tenants ?? []);
  if (!lock) return { files: 0, pages, durationMs: deps.now() - started, problems: [{ code: 'alreadyRunning' }] };

  const refuse = async (problems: PublishProblem[], files = 0): Promise<PublishWebsiteResult> => {
    const durationMs = deps.now() - started;
    await deps.closeLock(siteId, lock.id, 'refused', { problems: loggable(problems), files, pages, durationMs });
    return { files, pages, durationMs, problems };
  };

  let stage: FailureStage = 'load';
  try {
    if (!isWebsiteHostingSite(site.hostingSite)) {
      logger.error(`publishWebsite: ${siteId} refused, hostingSite ${JSON.stringify(site.hostingSite)} is not a website Hosting site`);
      return await refuse([{ code: 'hostingSiteInvalid' }]);
    }
    const { pages: pageMap, sections } = await deps.loadContent(site);
    stage = 'templates';
    let templates: TemplateSet;
    try {
      templates = await deps.loadTemplates(siteId, site.templateVersion);
    } catch (e) {
      if (e instanceof TemplateMissingError) return await refuse([e.problem]);
      throw e;
    }
    stage = 'render';
    const sanitize = await deps.getSanitizer();
    const rendered = deps.renderSite({ site, pages: pageMap, sections, templates, imageUrl: toImgixUrl, sanitize });
    if (rendered.problems.length > 0) return await refuse(rendered.problems);
    const files = rendered.files.length;

    if (dryRun) {
      const durationMs = deps.now() - started;
      await deps.closeLock(siteId, lock.id, 'dryRun', { files, pages, durationMs });
      return { files, pages, durationMs, problems: [] };
    }

    stage = 'hosting';
    const live = await deps.getLiveVersion(site.hostingSite);
    if (!live) return await refuse([{ code: 'noBaseRelease' }], files);

    const version = await deps.cloneStaticAssets(site.hostingSite, live);
    await deps.uploadFiles(version, rendered.files);
    await deps.finalizeAndRelease(site.hostingSite, version, `publishWebsite ${siteId} (${pages} pages, ${files} files)`);
    stage = 'site';
    const finished = deps.now();
    await deps.markPublished(siteId, {
      lastPublishedAt: new Date(finished).toISOString(),
      lastPublishedBy: personKey,
      lastPublishedVersion: version,
    });
    const durationMs = finished - started;
    await deps.closeLock(siteId, lock.id, 'done', { version, files, pages, durationMs });
    return { version, files, pages, durationMs, problems: [] };
  } catch (e) {
    logger.error(`publishWebsite: ${siteId} failed at ${stage}: ${errorMessage(e)}`);
    try {
      await deps.closeLock(siteId, lock.id, 'failed', { detail: stage, durationMs: deps.now() - started });
    } catch (closeError) {
      logger.error(`publishWebsite: ${siteId} lock ${lock.id} not closed: ${errorMessage(closeError)}`);
    }
    throw new HttpsError('internal', 'Die Website konnte nicht veröffentlicht werden.');
  }
}

// ─── Firestore loading ────────────────────────────────────────────────────────────────────────────

async function getAllChunked(db: Firestore, collection: string, ids: string[]): Promise<DocumentSnapshot[]> {
  const unique = [...new Set(ids.filter((id) => !!id && !id.includes('/')))];
  const out: DocumentSnapshot[] = [];
  for (let i = 0; i < unique.length; i += GET_ALL_CHUNK) {
    const refs = unique.slice(i, i + GET_ALL_CHUNK).map((id) => db.collection(collection).doc(id));
    out.push(...(await db.getAll(...refs)));
  }
  return out;
}

/** The doc ids a listed section key may resolve to (resolveServableSection's candidates). */
function sectionCandidates(raw: string, tenants: string[]): string[] {
  return [raw, ...tenants.map((t) => raw.replace('@TID@', t))];
}

/**
 * The pages of the tree (any node, archived ones included, so validation sees them) plus the home page,
 * owned by one of the site's tenants (a foreign page reads as missing); the sections they list and the
 * accordion items of those sections. Batched getAll reads, as publicApi's page route.
 */
export async function loadSiteContent(db: Firestore, site: WebsiteModel): Promise<SiteContent> {
  const tenants = site.tenants ?? [];
  const pageKeys = [...collectPageKeys([...(site.nav ?? []), ...(site.footer ?? [])]), site.homePageKey];
  const pages = new Map<string, PageModel>();
  for (const snap of await getAllChunked(db, PageCollection, pageKeys)) {
    const data = snap.data();
    if (!data) continue;
    const owners = Array.isArray(data['tenants']) ? (data['tenants'] as string[]) : [];
    if (!owners.some((t) => tenants.includes(t))) continue;
    pages.set(snap.id, { ...data, okey: snap.id } as unknown as PageModel);
  }

  const sections = new Map<string, SectionDoc>();
  const loadSections = async (ids: string[]): Promise<void> => {
    const missing = ids.filter((id) => !sections.has(id));
    for (const snap of await getAllChunked(db, SECTIONS, missing)) {
      const data = snap.data();
      if (data) sections.set(snap.id, data as SectionDoc);
    }
  };
  await loadSections([...pages.values()].flatMap((p) => (p.sections ?? []).flatMap((raw) => sectionCandidates(raw, tenants))));

  const nested: string[] = [];
  for (const page of pages.values()) {
    for (const { section } of publishedPageSections(page, tenants, sections)) {
      if (section.type !== 'accordion') continue;
      const items = section.properties?.['items'];
      for (const it of Array.isArray(items) ? (items as { key?: unknown }[]) : []) {
        if (typeof it?.key === 'string' && it.key) nested.push(...sectionCandidates(it.key, tenants));
      }
    }
  }
  if (nested.length > 0) await loadSections(nested);
  return { pages, sections };
}

function collectPageKeys(nodes: WebsiteNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'page' && n.pageKey) out.push(n.pageKey);
    collectPageKeys(n.children ?? [], out);
  }
  return out;
}

// ─── Callable ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The caller (contentAdmin or admin, checked before) may act on `siteId` when their tenant is one of the
 * site's tenants. Returns the site and the caller's personKey (users/{uid}.personKey, '' when unset).
 */
export async function authorizeSite(db: Firestore, request: CallableRequest, cfName: string, siteId: unknown): Promise<{ site: WebsiteModel; personKey: string }> {
  if (typeof siteId !== 'string' || !SAFE_SITE_ID.test(siteId)) throw new HttpsError('invalid-argument', 'siteId is missing or invalid');
  const tenantId = await getCallerTenantId(request as never, cfName);
  const [siteSnap, userSnap] = await Promise.all([
    db.collection(WebsiteCollection).doc(siteId).get(),
    db.collection('users').doc(request.auth?.uid ?? '').get(),
  ]);
  const data = siteSnap.data();
  if (!data) throw new HttpsError('not-found', 'website not found');
  const site = { ...data, okey: siteSnap.id } as unknown as WebsiteModel;
  if (!(site.tenants ?? []).includes(tenantId)) {
    logger.error(`${cfName}: caller tenant ${tenantId} is not a tenant of website ${siteId}`);
    throw new HttpsError('permission-denied', 'website belongs to another tenant');
  }
  if (site.isArchived) throw new HttpsError('failed-precondition', 'website is archived');
  const personKey = userSnap.data()?.['personKey'];
  return { site, personKey: typeof personKey === 'string' ? personKey : '' };
}

export async function markSitePublished(db: Firestore, siteId: string, fields: SitePublishedFields): Promise<void> {
  await db.collection(WebsiteCollection).doc(siteId).update(fields);
}

function realDeps(db: Firestore): PublishDeps {
  return {
    acquireLock: (siteId, personKey, tenants) => acquireLock(db, siteId, personKey, tenants),
    closeLock: (siteId, lockId, state, fields) => closeLock(db, siteId, lockId, state, fields),
    loadContent: (site) => loadSiteContent(db, site),
    loadTemplates,
    getSanitizer: getHtmlSanitizer,
    renderSite,
    getLiveVersion,
    cloneStaticAssets: (hostingSite, source) => cloneStaticAssets(hostingSite, source),
    uploadFiles,
    finalizeAndRelease,
    markPublished: (siteId, fields) => markSitePublished(db, siteId, fields),
    now: () => Date.now(),
  };
}

/** Renders and releases a website; `dryRun` renders and validates only. Problems are returned, not thrown. */
export const publishWebsite = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 300 },
  async (request: CallableRequest<{ siteId?: unknown; dryRun?: unknown }>): Promise<PublishWebsiteResult> => {
    const CF_NAME = 'publishWebsite';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, PUBLISH_ROLES);
    const db = getFirestore();
    const { site, personKey } = await authorizeSite(db, request, CF_NAME, request.data?.siteId);
    const result = await runPublish(realDeps(db), { site, dryRun: request.data?.dryRun === true, personKey });
    logger.info(`${CF_NAME}: ${site.okey} ${result.version ?? 'not released'} (${result.files} files, ${result.problems.length} problems, ${result.durationMs} ms)`);
    return result;
  },
);
