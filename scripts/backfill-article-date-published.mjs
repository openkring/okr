/**
 * BACKFILL `properties.datePublished` ON BLOG ARTICLES — dry run by default, idempotent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `ArticleConfig.datePublished` is optional and **nothing in the app has ever written it**:
 * `apps/functions/src/publicApi/routes/news.ts` is its only reader. So every article carried
 * none, the public API returned `date: ""` for all of them, and the feed's sort — which keys
 * on `datePublished` — compared empty strings, i.e. the order was really just page order.
 *
 * New articles are dated at creation from now on (`createSection` in
 * `libs/cms/section/util/src/lib/section.util.ts`). This script fixes the existing ones.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SCOPE — blog-page articles only, deliberately
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * There are 209 `article` sections, but only 22 are news: the rest are ordinary content
 * sections on other pages (`statuten-intro`, `bh_v_2018_umzonung`, `fo_map`, …) where a
 * publication date is meaningless, and many of them are SHARED across tenants. Stamping all
 * 209 would write a date onto other tenants' content to fix one tenant's feed. So the work
 * list is the sections listed on pages of `type: 'blog'`, nothing else.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * DATE SOURCES — in order, most authoritative first
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   1. `name`     — 19 of 22 encode it: `20260730news_coupedelajeunesse` → 20260730
 *                 (yyyymmdd, or ddmmyyyy where a legacy name used that — see dateFromName)
 *   2. `subTitle` — the other 3 carry a German long date: "01. August 2026" → 20260801
 *   3. TODAY      — the floor, so no article is ever left undated
 *
 * Source 2 exists because today is a *bad* date for an article that has a real one: the feed
 * sorts on this field, so stamping a June article with today's date pins it above every
 * newer story, permanently. On the current data the fallback to today matches ZERO articles
 * — it is there for the future, not for this run.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT and is what this script does when given no arguments.
 *   --write must be explicit.
 *   Idempotent: an article that already carries a valid 8-digit datePublished is skipped,
 *   so a re-run only picks up what is new and never overwrites a hand-corrected date.
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Usage:
 *   node scripts/backfill-article-date-published.mjs            # dry run
 *   node scripts/backfill-article-date-published.mjs --write
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const WRITE = process.argv.includes('--write');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const log = (verb, msg) => console.log(`  ${verb.padEnd(6)} ${msg}`);

/** German month names as they appear in a subTitle ("01. August 2026"). */
const MONTHS = {
  januar: '01', februar: '02', 'märz': '03', maerz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

/** A StoreDate is 8 digits, and must be a real calendar date. */
export function isStoreDate(value) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return false;
  const y = +value.slice(0, 4), m = +value.slice(4, 6), d = +value.slice(6, 8);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/**
 * `20260730news_coupedelajeunesse` → `20260730`.
 *
 * Two formats live in the data. The house convention is yyyymmdd, but at least one article
 * is named `26072026news_coupedelajeunesse` — ddmmyyyy, sitting right next to its yyyymmdd
 * sibling. Try yyyymmdd first, then ddmmyyyy, and accept only what is a real calendar date.
 * There is no ambiguity between the two: a valid yyyymmdd (`20260730`) read as ddmmyyyy gives
 * month 26, which fails, and vice versa.
 *
 * Undefined when the name carries no parseable date.
 */
export function dateFromName(name) {
  const match = /(\d{8})/.exec(name ?? '');
  if (!match) return undefined;
  const digits = match[1];
  if (isStoreDate(digits)) return digits;
  const asDdmmyyyy = `${digits.slice(4, 8)}${digits.slice(2, 4)}${digits.slice(0, 2)}`;
  return isStoreDate(asDdmmyyyy) ? asDdmmyyyy : undefined;
}

/** `"01. August 2026"` → `20260801`. Undefined when the subTitle is not a German long date. */
export function dateFromSubTitle(subTitle) {
  const match = /(\d{1,2})\.\s*([A-Za-zäöü]+)\s+(\d{4})/.exec(subTitle ?? '');
  if (!match) return undefined;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return undefined;
  const candidate = `${match[3]}${month}${match[1].padStart(2, '0')}`;
  return isStoreDate(candidate) ? candidate : undefined;
}

/** The date to stamp, and where it came from. `today` is the floor — never leave one empty. */
export function resolveDatePublished(section, today) {
  const fromName = dateFromName(section.name);
  if (fromName) return { date: fromName, source: 'name' };
  const fromSubTitle = dateFromSubTitle(section.subTitle);
  if (fromSubTitle) return { date: fromSubTitle, source: 'subTitle' };
  return { date: today, source: 'today' };
}

function todayStoreDate() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log(`\nbackfill-article-date-published — ${WRITE ? 'WRITE' : 'DRY RUN'}\n`);
  const today = todayStoreDate();

  // ── work list: the sections listed on every blog page ────────────────────────────────
  const pagesSnap = await db.collection('pages').where('type', '==', 'blog').get();
  const keys = new Set();
  for (const page of pagesSnap.docs) {
    for (const key of page.data().sections ?? []) keys.add(key);
  }
  console.log(`${pagesSnap.size} blog page(s), ${keys.size} distinct section key(s)\n`);
  if (keys.size === 0) {
    console.log('Nothing to do.\n');
    return;
  }

  const counts = { name: 0, subTitle: 0, today: 0, skipped: 0, missing: 0, notArticle: 0 };

  for (const key of keys) {
    const snap = await db.collection('sections').doc(key).get();
    if (!snap.exists) { counts.missing++; log('miss', `sections/${key} does not exist`); continue; }
    const section = snap.data();

    if (section.type !== 'article') { counts.notArticle++; continue; }

    // Idempotent, and never overwrites a hand-corrected date.
    if (isStoreDate(section.properties?.datePublished)) {
      counts.skipped++;
      continue;
    }

    const { date, source } = resolveDatePublished(section, today);
    counts[source]++;
    const label = `sections/${key} → ${date} (from ${source})  ${JSON.stringify((section.title ?? '').slice(0, 40))}`;
    if (WRITE) {
      await db.collection('sections').doc(key).update({ 'properties.datePublished': date });
      log('set', label);
    } else {
      log('would', label);
    }
  }

  console.log(`\nfrom name: ${counts.name}, from subTitle: ${counts.subTitle}, today: ${counts.today}, `
    + `already dated: ${counts.skipped}, not an article: ${counts.notArticle}, missing: ${counts.missing}`);
  console.log(WRITE ? '\nDone.\n' : '\nDry run — nothing written. Re-run with --write.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
