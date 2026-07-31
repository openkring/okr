import { createHash } from 'node:crypto';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import type { ErasurePreview, OutOfReachRow, PreviewRow } from '@okr/shared-models';
import { DateFormat, addDuration, convertDateFormatToString } from '@okr/shared-util-core';
import { resolveDocs } from './subject-data-map';
import type { Blocker, SubjectCtx, SubjectDataEntry } from './types';

/**
 * The erasure preflight (5B, task C1) — the honest report a member sees before they
 * confirm "Meine Daten löschen".
 *
 * It answers five questions, in this order:
 *
 * 1. **`blockers`** — what stops the erasure right now, in plain German, each with the
 *    tiers it actually blocks.
 * 2. **`willDelete`** — what disappears.
 * 3. **`willAnonymize`** — what stays as a record with the identity overwritten, and
 *    until when, and on what legal basis.
 * 4. **`willRetain`** — what survives the erasure untouched, and why. A member whose
 *    signed documents keep their name and e-mail has to be told so; the alternative is
 *    a report that is silent about exactly the data it does not remove.
 * 5. **`canDeleteNow`** — the consent-tier rows a blocker does *not* block, i.e. what is
 *    still possible while the membership continues (the 2026-07-29 amendment).
 * 6. **`outOfReach`** — the third parties holding copies we cannot reach from here.
 *
 * Plus a `previewToken`: a SHA-256 over the report's content (never its timestamp), so
 * `eraseMyData` can refuse to execute a confirmation the member gave for a different
 * situation.
 *
 * D-P5-2 — nothing in this report may name, count or imply another tenancy. The report
 * speaks about `ctx.tenantId` and nothing else.
 */

/** Returns the documents of one row for one subject. Injected so the whole preflight is
 * unit-testable without an emulator; production is `firestoreDocFetcher`. */
export type DocFetcher = (entry: SubjectDataEntry, ctx: SubjectCtx) => Promise<DocumentSnapshot[]>;

/**
 * Production fetcher. Goes through `resolveDocs`, **never** `entry.find(ctx).get()`:
 * `find` deliberately over-fetches on the 8 rows that carry a `matches` post-filter, and
 * feeding those raw results to the preview would count other members' documents — and
 * feeding them to the executor would erase them.
 */
export const firestoreDocFetcher: DocFetcher = (entry, ctx) => resolveDocs(entry, ctx);

/**
 * The report shape itself is the wire contract in `@okr/shared-models`
 * (`privacy-rights.model.ts`): the profile card renders exactly what this function
 * returns, and a second declaration on the client would drift from it. `OutOfReachRow` is
 * shaped to match what the 5C processor catalogue will produce, so the sibling plan can
 * swap the constant below for a real query without touching the type. Re-exported here so
 * the privacy module's own consumers keep one import site.
 */
export type { ErasurePreview, OutOfReachRow, PreviewRow } from '@okr/shared-models';

/**
 * Seeded from `planning/reference/privacy-data-inventory.md` §4 (the third-party
 * transfer register).
 *
 * ⚠️ **Known gap, owned by task A2 of the sibling 5C plan.** This is a constant, so a
 * tenant that never enabled bexio is still told bexio holds their data. When the 5C
 * processor catalogue lands, replace it with a catalogue query filtered to the tenant's
 * enabled integrations. Until then a slightly over-broad list is the safer error: naming
 * a processor that holds nothing is a confusing report, omitting one that does is a
 * false statement about where the member's data went.
 *
 * `contact` says how the member reaches the recipient. For a processor acting on the
 * club's instruction that is the club's own data-protection contact, which forwards the
 * request — that is what "processor" means. The Matrix homeserver is the exception: the
 * message bodies belong to the operator and no erasure here touches them.
 */
export const OUT_OF_REACH_PROCESSORS: readonly OutOfReachRow[] = [
  {
    key: 'srv',
    name: 'Regasoft (Verbandssystem Swiss Rowing)',
    contact: 'Über die Datenschutz-Kontaktstelle des Vereins (siehe Impressum) — wir leiten deine Anfrage an den Verband weiter.',
    dataClasses: ['identity', 'contact', 'membership'],
  },
  {
    key: 'bexio',
    name: 'bexio AG (Buchhaltung)',
    contact: 'Über die Datenschutz-Kontaktstelle des Vereins (siehe Impressum). Rechnungen unterliegen dort derselben zehnjährigen Aufbewahrungspflicht wie bei uns.',
    dataClasses: ['identity', 'contact', 'financial'],
  },
  {
    key: 'deepsign',
    name: 'DeepSign (Swisscom Trust Services)',
    contact: 'Über die Datenschutz-Kontaktstelle des Vereins (siehe Impressum). Signierte Dokumente bleiben als Beweismittel unverändert.',
    dataClasses: ['identity', 'content'],
  },
  {
    key: 'matrix',
    name: 'Matrix-Chatserver',
    contact: 'Die Inhalte deiner Chatnachrichten liegen auf dem Chatserver und werden durch diese Löschung nicht entfernt. Wende dich dafür an die Datenschutz-Kontaktstelle des Vereins (siehe Impressum).',
    dataClasses: ['identity', 'communication'],
  },
  {
    key: 'email',
    name: 'E-Mail-Versanddienst',
    contact: 'Bereits versandte E-Mails lassen sich nicht zurückholen. Zustellprotokolle beim Versanddienst löschen sich nach dessen eigener Frist.',
    dataClasses: ['contact', 'communication'],
  },
];

/** Tenant-level blocker: the last remaining admin cannot erase themselves out of the
 * tenant. Scoped to T1 — it is a role handover problem, not a reason to keep a photo. */
function soleAdminBlocker(): Blocker {
  return {
    code: 'soleAdmin',
    count: 1,
    detail: 'Du bist die einzige Person mit Administrationsrechten in diesem Verein. Bitte übertrage diese Rolle zuerst an jemand anderen, sonst bleibt der Verein ohne Verwaltung zurück.',
    blocksTiers: ['T1'],
  };
}

/**
 * StoreDate of the newest document in `docs`, or `undefined` when none of them carries a
 * server timestamp.
 *
 * `updateTime` is an approximation of the record's own date: the retention clock of
 * OR 958f runs from the close of the business year, not from the last write. It is used
 * anyway because it is the one date every collection has — a per-row `dateField` column
 * would have to be right for 40 collections to beat it. The approximation is
 * conservative for the member (a re-saved record reads as newer, i.e. kept longer than
 * strictly necessary, never shorter), and the 5D retention audit is what grades the
 * actual end dates.
 */
function newestStoreDate(docs: DocumentSnapshot[]): string | undefined {
  const times = docs
    .map((d) => d.updateTime?.toDate?.())
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  if (times.length === 0) return undefined;

  const newest = new Date(Math.max(...times.map((d) => d.getTime())));
  // trim the milliseconds + 'Z' that DateFormat.IsoDateTime does not expect
  return convertDateFormatToString(newest.toISOString().slice(0, 19), DateFormat.IsoDateTime, DateFormat.StoreDate, false);
}

/** Repo rule: date arithmetic goes through `@okr/shared-util-core`, never a hand-rolled
 * helper. Returns `undefined` for an indefinite retention or an uncomputable date. */
function retentionEndOf(entry: SubjectDataEntry, docs: DocumentSnapshot[]): string | undefined {
  if (entry.retention.months === 'indefinite') return undefined;
  const from = newestStoreDate(docs);
  if (!from) return undefined;
  return addDuration(from, { months: entry.retention.months });
}

function toPreviewRow(entry: SubjectDataEntry, docs: DocumentSnapshot[], survives: boolean): PreviewRow {
  const base = { collection: entry.collection, dataClass: entry.dataClass, tier: entry.tier, count: docs.length };
  if (!survives) return base;
  const retentionEndsAt = retentionEndOf(entry, docs);
  return { ...base, legalBasis: entry.retention.legalBasis, ...(retentionEndsAt ? { retentionEndsAt } : {}) };
}

/** JSON with object keys sorted, so an incidental key reordering cannot invalidate a
 * confirmation the member already gave. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface PreviewTokenParts {
  readonly blockers: readonly Blocker[];
  readonly willDelete: readonly PreviewRow[];
  readonly willAnonymize: readonly PreviewRow[];
  readonly willRetain: readonly PreviewRow[];
  readonly canDeleteNow: readonly PreviewRow[];
}

/**
 * SHA-256 over the report's content. Deliberately excludes `generatedAt` and
 * `outOfReach`: an unchanged situation must yield a stable token (otherwise every
 * confirmation races the clock), and the processor list is a constant the member's own
 * data cannot change. Everything the member actually decided on is in here — including
 * `canDeleteNow`, so a consent-tier row appearing or vanishing between preview and
 * confirmation invalidates the confirmation.
 */
export function previewTokenOf(parts: PreviewTokenParts): string {
  return createHash('sha256').update(canonical(parts)).digest('hex');
}

/**
 * Builds the preflight report.
 *
 * @param entries          the subject-data map (injected so tests need no emulator)
 * @param fetchDocs        `firestoreDocFetcher` in production — it MUST be a fetcher that
 *                         goes through `resolveDocs`, because `blocksErasure` is
 *                         contractually fed the tenant- and `matches`-filtered set only
 * @param otherAdminCount  admins of this tenant OTHER than the subject; `0` blocks
 * @param outOfReach       third-party copies (see `OUT_OF_REACH_PROCESSORS`)
 */
export async function buildPreview(
  ctx: SubjectCtx,
  entries: readonly SubjectDataEntry[],
  fetchDocs: DocFetcher,
  otherAdminCount: number,
  outOfReach: readonly OutOfReachRow[] = OUT_OF_REACH_PROCESSORS,
): Promise<ErasurePreview> {
  const blockers: Blocker[] = [];
  const willDelete: PreviewRow[] = [];
  const willAnonymize: PreviewRow[] = [];
  const willRetain: PreviewRow[] = [];
  const voluntary: { entry: SubjectDataEntry; row: PreviewRow }[] = [];

  if (otherAdminCount <= 0) blockers.push(soleAdminBlocker());

  for (const entry of entries) {
    const docs = await fetchDocs(entry, ctx);
    // An empty collection is not a finding and must not become a line in the report —
    // and a blocker predicate is never asked about an empty set (map contract step 4).
    if (docs.length === 0) continue;

    const blocker = entry.blocksErasure?.(docs);
    if (blocker) blockers.push(blocker);

    const row = toPreviewRow(entry, docs, entry.onErasure !== 'delete');
    if (entry.onErasure === 'delete') willDelete.push(row);
    else if (entry.onErasure === 'anonymize') willAnonymize.push(row);
    else willRetain.push(row);

    if (entry.tier === 'T2') voluntary.push({ entry, row });
  }

  const canDeleteNow = blockers.length === 0 ? [] : voluntary
    // A blocker with no `blocksTiers` blocks everything — an unannotated blocker is one
    // whose author did not think about tiers, and guessing on their behalf is how the
    // report starts promising deletions the law does not require of us.
    .filter(() => !blockers.some((b) => !b.blocksTiers || b.blocksTiers.includes('T2')))
    .map((v) => v.row);

  return {
    blockers,
    willDelete,
    willAnonymize,
    willRetain,
    canDeleteNow,
    outOfReach: [...outOfReach],
    previewToken: previewTokenOf({ blockers, willDelete, willAnonymize, willRetain, canDeleteNow }),
  };
}
