import { resolveDocs, SUBJECT_DATA_MAP } from './subject-data-map';
import type { SubjectCtx, SubjectDataEntry } from './types';

/**
 * D-P5-3 export — assembles the "gather" step of a GDPR/revDSG data export: given the
 * subject's ctx, walk `SUBJECT_DATA_MAP` and collect everything about them into one
 * bundle. A later task turns this bundle into a downloadable ZIP.
 *
 * Two shapes per row, driven by `SubjectDataEntry.onExport` (see types.ts):
 * - `'full'`  the row's documents go verbatim into `bundle.full[collection]`.
 * - `'index'` the row's documents are reduced to `{ title, date, route }` only — this
 *             is what keeps a member's authored content (docs, calevents, tasks,
 *             comments, …) a list of links rather than a wholesale dump. Any field not
 *             named in `indexFields` MUST NOT reach the bundle.
 * - `'none'`  the row is skipped entirely; its fetcher is never even invoked.
 */

/** One entry in an `index`-mode export section. Only these three fields ever appear. */
export interface IndexRow {
  readonly title: string;
  readonly date: string;
  readonly route: string;
}

export interface SubjectDataBundle {
  readonly generatedAt: string;
  readonly tenantId: string;
  readonly full: Record<string, unknown[]>;
  readonly index: Record<string, IndexRow[]>;
}

/**
 * Fetches one row's documents for a given subject. Injectable so `buildBundle` can be
 * unit-tested without a Firestore emulator; the production implementation is
 * `firestoreFetcher`, which is the only one allowed to call `resolveDocs`.
 */
export type Fetcher = (entry: SubjectDataEntry, ctx: SubjectCtx) => Promise<Record<string, unknown>[]>;

/** Joins an `indexFields.route` prefix with a document id, tolerating either convention
 * (`'/document/'` or `'/document'`) without ever producing a doubled or missing slash. */
function withRoute(routePrefix: string, okey: string): string {
  return routePrefix.endsWith('/') ? `${routePrefix}${okey}` : `${routePrefix}/${okey}`;
}

/**
 * Pure assembly of a `SubjectDataBundle` from a set of map rows and an injected
 * `fetch`. Never touches Firestore itself — that is `fetch`'s job — so it is exercised
 * directly by `gather.spec.ts` with a fake fetcher and no emulator.
 */
export async function buildBundle(
  ctx: SubjectCtx,
  entries: readonly SubjectDataEntry[],
  fetch: Fetcher,
): Promise<SubjectDataBundle> {
  const bundle: SubjectDataBundle = {
    generatedAt: new Date().toISOString(),
    tenantId: ctx.tenantId,
    full: {},
    index: {},
  };

  for (const entry of entries) {
    if (entry.onExport === 'none') continue;

    const docs = await fetch(entry, ctx);

    if (entry.onExport === 'full') {
      bundle.full[entry.collection] = docs;
      continue;
    }

    // onExport === 'index' — reduce to title/date/route ONLY. Building the row via an
    // object literal that names exactly these three keys (rather than e.g. spreading
    // the source doc and deleting fields) is what makes a regression that adds a
    // fourth field to the row impossible to introduce silently.
    const fields = entry.indexFields;
    if (!fields) continue; // malformed row (should never happen; map's own tests guard this)
    bundle.index[entry.collection] = docs.map(
      (d): IndexRow => ({
        title: String(d[fields.title] ?? ''),
        date: String(d[fields.date] ?? ''),
        route: withRoute(fields.route, String(d['okey'] ?? '')),
      }),
    );
  }

  return bundle;
}

/**
 * Production fetcher — runs the entry's Firestore query under the Admin SDK.
 *
 * MUST go through `resolveDocs`, never `entry.find(ctx).get()` directly: eight rows in
 * `SUBJECT_DATA_MAP` carry a `matches` predicate because Firestore cannot query the
 * shape they store, and `resolveDocs` is the only path that applies tenant scoping and
 * `matches` in the pinned order. Calling `find` directly compiles fine and would leak
 * other members' documents into this export.
 */
export const firestoreFetcher: Fetcher = async (entry, ctx) => {
  const docs = await resolveDocs(entry, ctx);
  return docs.map((d) => ({ okey: d.id, ...d.data() }));
};

/** Production entry point: gathers the full export bundle for one subject. */
export function gatherSubjectData(ctx: SubjectCtx): Promise<SubjectDataBundle> {
  return buildBundle(ctx, SUBJECT_DATA_MAP, firestoreFetcher);
}
