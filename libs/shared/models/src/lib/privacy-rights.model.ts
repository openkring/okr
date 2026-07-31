/**
 * The wire contract of the three data-subject-rights callables (privacy 1.19, Phase 5B):
 * `exportMyData`, `previewMyErasure` and `eraseMyData`.
 *
 * **These are not persisted models.** Nothing in this file describes a Firestore
 * document — it is the shape that crosses the callable boundary. It lives in
 * `shared-models` for one reason: the Cloud Function produces it and the profile card
 * renders it, and a second declaration on the client would drift from the server's the
 * first time a section is added. (It already would have: the erasure report grew a fifth
 * section during implementation.)
 *
 * The erasure-side counterpart that IS persisted is `ErasureLogModel`.
 */

/** Coarse category a collection's personal data falls into — groups the report into
 * sections a member can actually read ("Kontaktdaten", "Finanzen", …). */
export type DataClass =
  | 'identity' | 'contact' | 'membership' | 'financial'
  | 'communication' | 'content' | 'consent' | 'log';

/**
 * Legal basis of a row — the four tiers of the membership-lifecycle spec §3.
 *
 * - `T1` identity + membership — contract; erasure lawfully refusable while it runs
 * - `T2` optional / voluntary — consent, and consent is withdrawable at any time
 * - `T3` accounting — legal obligation (OR 958f / GebüV, 10 years)
 * - `T4` club record and operational logs — legitimate interest
 */
export type DataTier = 'T1' | 'T2' | 'T3' | 'T4';

export type BlockerCode = 'activeMembership' | 'openInvoice' | 'pendingSignature' | 'soleAdmin';

/** A reason the erasure cannot be executed yet. `detail` is authored server-side, in
 * German, and is rendered VERBATIM — the honest wording lives next to the rule that
 * produces it, not in a translation file that can drift from it. */
export interface Blocker {
  readonly code: BlockerCode;
  readonly count: number;
  readonly detail: string;
  /** The tiers this blocker blocks. `activeMembership` blocks `['T1']` only; a blocker
   * that omits this blocks everything. Nothing may block `T2`. */
  readonly blocksTiers?: readonly DataTier[];
}

export interface PreviewRow {
  readonly collection: string;
  readonly dataClass: DataClass;
  readonly tier: DataTier;
  readonly count: number;
  /** StoreDate (`yyyyMMdd`), only on rows that survive the erasure and only when it can
   * be computed. */
  readonly retentionEndsAt?: string;
  /** German, only on rows that survive. */
  readonly legalBasis?: string;
}

/** A third party holding a copy this erasure cannot reach. */
export interface OutOfReachRow {
  readonly key: string;
  readonly name: string;
  readonly contact: string;
  readonly dataClasses: readonly DataClass[];
}

/**
 * The preflight report. Render the sections in this order — it is the order the member
 * needs them: what stops this, what goes, what is kept and until when, what is not
 * touched at all, what is possible right now anyway, who else holds a copy.
 */
export interface ErasurePreview {
  readonly blockers: Blocker[];
  readonly willDelete: PreviewRow[];
  readonly willAnonymize: PreviewRow[];
  /** Rows the erasure does NOT touch. A report silent about what it keeps is not honest. */
  readonly willRetain: PreviewRow[];
  /** A subset view of `willDelete`: the consent-tier rows a blocker does not block, i.e.
   * what is deletable *while the membership continues*. Empty when nothing is blocked. */
  readonly canDeleteNow: PreviewRow[];
  readonly outOfReach: OutOfReachRow[];
  /** Confirm with this. `eraseMyData` rebuilds the report server-side and refuses a token
   * that no longer matches, so a confirmation cannot execute a different situation. */
  readonly previewToken: string;
}

/**
 * Deliberately says nothing about whether the person record or the login survived: that
 * can only be answered by looking at other tenancies, and D-P5-2 forbids disclosing
 * whether any exist.
 */
export interface EraseMyDataResponse {
  readonly executedAt: string;
  readonly pseudonym: string;
  readonly counts: Record<string, number>;
}

export interface ExportMyDataResponse {
  readonly downloadUrl: string;
  readonly expiresAt: string;
  readonly sizeBytes: number;
}
