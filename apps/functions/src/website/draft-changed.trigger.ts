// apps/functions/src/website/draft-changed.trigger.ts
//
// «Unpublished changes» dot (spec 1.153 §6.4): a write to pages/{id} or sections/{id} bumps
// websites/{siteId}.draftChangedAt for every site whose tree (nav ∪ footer) or home page references
// the changed page. Never watches `websites` (publish/rollback write there) and writes only when a
// site actually references the page. A site is bumped at most once per event.
//
// Known gap: a write to a section that is only nested in an accordion (listed in
// AccordionConfig.items[].key, not on a page) does not bump — Firestore cannot query inside an
// array of objects, and an index of nested keys is more than this dot is worth. Editing the
// accordion section itself (its item list) does bump.
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { PageCollection, SectionCollection, WebsiteCollection, type WebsiteNode } from '@okr/shared-models';

const TID = '@TID@';
const ANY_LIMIT = 30; // Firestore array-contains-any maximum

/** The section key as a page may list it: the literal key plus every `@TID@` form (one occurrence of a tenant id at a time). */
export function sectionKeyVariants(key: string, tenants: string[]): string[] {
  const out = [key];
  for (const t of tenants) {
    if (!t) continue;
    for (let i = key.indexOf(t); i >= 0; i = key.indexOf(t, i + 1)) {
      const v = key.slice(0, i) + TID + key.slice(i + t.length);
      if (!out.includes(v)) out.push(v);
    }
  }
  return out.slice(0, ANY_LIMIT);
}

function keysInTree(nodes: WebsiteNode[] | undefined, out: Set<string>): void {
  for (const n of nodes ?? []) {
    if (n.type === 'page' && n.pageKey) out.add(n.pageKey);
    keysInTree(n.children, out);
  }
}

/** Bumps every site of the given tenants that references one of the pages. Returns the number of sites written. */
export async function bumpSitesForPage(db: Firestore, pageKeys: string[], tenants: string[]): Promise<number> {
  if (!pageKeys.length) return 0;
  const bumped = new Set<string>();
  for (const tenant of tenants) {
    const snap = await db.collection(WebsiteCollection).where('tenants', 'array-contains', tenant).get();
    for (const doc of snap.docs) {
      if (bumped.has(doc.id)) continue;
      const site = doc.data();
      const keys = new Set<string>();
      keysInTree(site['nav'], keys);
      keysInTree(site['footer'], keys);
      if (site['homePageKey']) keys.add(site['homePageKey'] as string);
      if (pageKeys.some((k) => keys.has(k))) bumped.add(doc.id);
    }
  }
  const now = new Date().toISOString();
  for (const id of bumped) await db.collection(WebsiteCollection).doc(id).update({ draftChangedAt: now });
  return bumped.size;
}

/** A section changed: bump the sites of the pages that list it. */
export async function bumpSitesForSection(db: Firestore, sectionKey: string, sectionTenants: string[]): Promise<number> {
  const snap = await db.collection(PageCollection).where('sections', 'array-contains-any', sectionKeyVariants(sectionKey, sectionTenants)).get();
  const pageKeys: string[] = [];
  const tenants = new Set<string>();
  for (const doc of snap.docs) {
    pageKeys.push(doc.id);
    for (const t of (doc.data()['tenants'] as string[] | undefined) ?? []) tenants.add(t);
  }
  return bumpSitesForPage(db, pageKeys, [...tenants]);
}

interface WrittenEvent {
  params: Record<string, string>;
  data?: { before?: { data(): Record<string, unknown> | undefined }; after?: { data(): Record<string, unknown> | undefined } };
}

function tenantsOf(event: WrittenEvent): string[] {
  const t = (event.data?.after?.data() ?? event.data?.before?.data())?.['tenants'];
  return Array.isArray(t) ? (t as string[]) : [];
}

export const onPageWrittenForWebsite = onDocumentWritten(
  { document: `${PageCollection}/{pageId}`, region: 'europe-west6', memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 },
  async (event) => {
    try {
      await bumpSitesForPage(getFirestore(), [event.params['pageId']], tenantsOf(event));
    } catch (err) {
      logger.error('onPageWrittenForWebsite failed', { pageId: event.params['pageId'], error: err instanceof Error ? err.message : String(err) });
    }
  },
);

export const onSectionWrittenForWebsite = onDocumentWritten(
  { document: `${SectionCollection}/{sectionId}`, region: 'europe-west6', memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 },
  async (event) => {
    try {
      await bumpSitesForSection(getFirestore(), event.params['sectionId'], tenantsOf(event));
    } catch (err) {
      logger.error('onSectionWrittenForWebsite failed', { sectionId: event.params['sectionId'], error: err instanceof Error ? err.message : String(err) });
    }
  },
);
