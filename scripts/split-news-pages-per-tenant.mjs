/**
 * SPLIT THE SHARED NEWS BLOG PAGE PER TENANT — dry run by default, idempotent, re-runnable.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Page document ids are GLOBAL — `pages` is one collection for every tenant — so a literal
 * page id in shared content points every tenant at the same document. Two such literals
 * existed:
 *
 *   - `sections/d-news` (SHARED: scs, kring, elab) carried `properties.blogPageKey: 'news'`
 *   - the CMS catalogue route `/public/news` carried `data.id: 'news'`
 *
 * Both resolved to `pages/news`, which is scs-owned (`tenants: ['scs']`, 22 scs articles).
 * Result: elab-app and kring-app rendered scs's news feed on their dashboard. Neither the
 * client `PageStore`/`NewsStore` nor the `publicApi` /news route checked `tenants` on a
 * read-by-id, and `pages`/`sections` are `allow read: if true` in firestore.rules (the
 * anonymous PWA landing needs that), so nothing stopped it.
 *
 * The code half is fixed separately (tenant checks on every read-by-key, plus @TID@
 * resolution on the page key). This script fixes the DATA half:
 *
 *   1. COPY `pages/news` → `pages/news_scs` (unchanged content, `tenants: ['scs']`).
 *   2. CREATE an empty blog page `pages/news_<t>` for every other tenant on `d-news`
 *      (kring, elab) — without it the fixed code correctly shows them nothing at all.
 *   3. REPOINT every literal `news` page reference at `news_@TID@`: the shared section's
 *      `blogPageKey`, its "mehr" button (`moreUrl`) and the scs main-menu entry
 *      (`menuItems/scs-news.url`). The section doc stays SHARED; the placeholder is what
 *      makes it resolve per tenant, exactly like the section keys in
 *      `pages/dashboard.sections`. PageDispatcher resolves @TID@ for the two URL forms.
 *   4. ARCHIVE the legacy `pages/news` (`isArchived: true`). Archived, not deleted: it is
 *      the only copy of scs's ordered article list until step 1 is verified, and the
 *      archive-vs-delete rule applies to any doc other tenants may still reference.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT and is what this script does when given no arguments.
 *   --write must be explicit.
 *   Every step is idempotent: re-running after a partial run is safe and reports 'skip'.
 *   Step 4 refuses to archive `pages/news` unless `pages/news_scs` exists and its
 *   `sections` array matches the legacy one exactly.
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Usage:
 *   node scripts/split-news-pages-per-tenant.mjs             # dry run
 *   node scripts/split-news-pages-per-tenant.mjs --write
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const WRITE = process.argv.includes('--write');

/** The shared dashboard section whose blogPageKey drove the leak. */
const NEWS_SECTION = 'd-news';
/** The scs-owned legacy page every tenant was reading. */
const LEGACY_PAGE = 'news';

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const log = (verb, msg) => console.log(`  ${verb.padEnd(6)} ${msg}`);

/** An empty blog page for a tenant that has no news yet. Mirrors the legacy page's shape. */
function emptyBlogPage(tenantId, title) {
  return {
    name: 'News',
    title,
    subTitle: '',
    abstract: '',
    type: 'blog',
    blogType: 'classic',
    state: 'published',
    index: `n:News k:news_${tenantId} tt:aktuelles`,
    sections: [],
    meta: [],
    notes: '',
    tags: '',
    isArchived: false,
    isPrivate: false,
    logoUrl: '',
    logoAltText: '',
    bannerUrl: '',
    bannerAltText: '',
    tenants: [tenantId],
  };
}

async function main() {
  console.log(`\nsplit-news-pages-per-tenant — ${WRITE ? 'WRITE' : 'DRY RUN'}\n`);

  // ── read the current state ────────────────────────────────────────────────────────────
  const legacySnap = await db.collection('pages').doc(LEGACY_PAGE).get();
  if (!legacySnap.exists) {
    console.log(`pages/${LEGACY_PAGE} does not exist — nothing to split (already migrated?).`);
  }
  const legacy = legacySnap.exists ? legacySnap.data() : undefined;

  const sectionSnap = await db.collection('sections').doc(NEWS_SECTION).get();
  if (!sectionSnap.exists) throw new Error(`sections/${NEWS_SECTION} not found — aborting.`);
  const section = sectionSnap.data();

  const tenants = Array.isArray(section.tenants) ? [...section.tenants] : [];
  if (!tenants.length) throw new Error(`sections/${NEWS_SECTION} has no tenants — aborting.`);
  console.log(`sections/${NEWS_SECTION} is shared by: ${tenants.join(', ')}`);
  console.log(`current blogPageKey: ${JSON.stringify(section.properties?.blogPageKey)}\n`);

  // ── 1. copy the legacy page to its tenant-scoped id ───────────────────────────────────
  console.log('1. tenant-scoped blog pages');
  const owner = legacy && Array.isArray(legacy.tenants) && legacy.tenants.length === 1
    ? legacy.tenants[0]
    : undefined;

  if (legacy && !owner) {
    throw new Error(`pages/${LEGACY_PAGE} has tenants ${JSON.stringify(legacy.tenants)} — expected exactly one owner. Resolve by hand.`);
  }

  if (owner) {
    const targetId = `${LEGACY_PAGE}_${owner}`;
    const existing = await db.collection('pages').doc(targetId).get();
    if (existing.exists) {
      log('skip', `pages/${targetId} already exists`);
    } else if (WRITE) {
      await db.collection('pages').doc(targetId).set({ ...legacy, index: `n:News k:${targetId} tt:aktuelles` });
      log('copy', `pages/${LEGACY_PAGE} → pages/${targetId} (${legacy.sections?.length ?? 0} sections)`);
    } else {
      log('would', `copy pages/${LEGACY_PAGE} → pages/${targetId} (${legacy.sections?.length ?? 0} sections)`);
    }
  }

  // ── 2. an empty blog page for every other tenant on the shared section ────────────────
  for (const tenantId of tenants) {
    if (tenantId === owner) continue;
    const targetId = `${LEGACY_PAGE}_${tenantId}`;
    const existing = await db.collection('pages').doc(targetId).get();
    if (existing.exists) {
      log('skip', `pages/${targetId} already exists`);
      continue;
    }
    if (WRITE) {
      await db.collection('pages').doc(targetId).set(emptyBlogPage(tenantId, 'Aktuelles'));
      log('create', `pages/${targetId} (empty, tenants: ['${tenantId}'])`);
    } else {
      log('would', `create pages/${targetId} (empty, tenants: ['${tenantId}'])`);
    }
  }

  // ── 3. repoint every literal 'news' page reference at the placeholder ─────────────────
  // The blog page is reached three ways and ALL of them carried the literal id:
  //   - the dashboard news section's blogPageKey (the leak)
  //   - its "mehr" button          → /private/news/…
  //   - the scs main-menu entry    → /public/news/…
  // The last two land on the catalogue's `:id` routes, where PageDispatcher resolves @TID@,
  // so the placeholder is the right shape for them too.
  console.log('\n2. literal page references');
  const desiredKey = `${LEGACY_PAGE}_@TID@`;
  const refs = [
    { col: 'sections', id: NEWS_SECTION, field: 'properties.blogPageKey', current: section.properties?.blogPageKey, next: desiredKey },
    { col: 'sections', id: NEWS_SECTION, field: 'properties.moreUrl', current: section.properties?.moreUrl, next: `/private/${desiredKey}/c-contentpage` },
    { col: 'menuItems', id: 'scs-news', field: 'url', current: undefined, next: `/public/${desiredKey}/c-contentpage` },
  ];

  for (const ref of refs) {
    let current = ref.current;
    if (current === undefined) {
      const snap = await db.collection(ref.col).doc(ref.id).get();
      if (!snap.exists) { log('skip', `${ref.col}/${ref.id} does not exist`); continue; }
      current = ref.field.split('.').reduce((o, k) => o?.[k], snap.data());
    }
    if (current === ref.next) {
      log('skip', `${ref.col}/${ref.id}.${ref.field} is already '${ref.next}'`);
    } else if (WRITE) {
      await db.collection(ref.col).doc(ref.id).update({ [ref.field]: ref.next });
      log('set', `${ref.col}/${ref.id}.${ref.field} = '${ref.next}'`);
    } else {
      log('would', `set ${ref.col}/${ref.id}.${ref.field} = '${ref.next}' (was ${JSON.stringify(current)})`);
    }
  }

  // ── 4. archive the legacy page, but only once the copy is verified ────────────────────
  console.log('\n3. legacy page');
  if (!legacy) {
    log('skip', `pages/${LEGACY_PAGE} does not exist`);
  } else if (legacy.isArchived === true) {
    log('skip', `pages/${LEGACY_PAGE} is already archived`);
  } else {
    const copy = await db.collection('pages').doc(`${LEGACY_PAGE}_${owner}`).get();
    const copied = copy.exists
      && JSON.stringify(copy.data().sections ?? []) === JSON.stringify(legacy.sections ?? []);
    if (!copied && WRITE) {
      log('hold', `pages/${LEGACY_PAGE}_${owner} missing or its sections differ — NOT archiving. Re-run.`);
    } else if (WRITE) {
      await db.collection('pages').doc(LEGACY_PAGE).update({ isArchived: true });
      log('arch', `pages/${LEGACY_PAGE} archived (superseded by pages/${LEGACY_PAGE}_${owner})`);
    } else {
      log('would', `archive pages/${LEGACY_PAGE} once pages/${LEGACY_PAGE}_${owner} is verified`);
    }
  }

  console.log(WRITE ? '\nDone.\n' : '\nDry run — nothing written. Re-run with --write.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
