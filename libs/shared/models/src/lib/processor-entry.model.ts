/**
 * One row of the Bearbeitungsverzeichnis (record of processing activities, revDSG Art. 12 /
 * GDPR Art. 30) — a third party that receives personal data from this platform.
 *
 * **This is not a persisted collection.** There is no `subprocessors` collection and no
 * scanner (D-P5-5, spec 1.19 Phase 5C). The authoritative list is `PROCESSOR_CATALOGUE`,
 * a typed constant versioned in git next to the code that talks to each provider, in
 * `@okr/security-processing-util`. The type lives here only because `AppConfig` carries
 * the tenant-added entries (`additionalProcessors`) and `shared-models` may not depend on
 * a feature lib.
 *
 * Every field is legal text an auditor reads. `purposes`, `securityMeasures` and
 * `retentionText` are authored **in German, verbatim** — they are data, not i18n keys.
 */

import type { DataClass } from './privacy-rights.model';

/**
 * The party's role relative to the tenant, who is always the controller.
 *
 * - `processor`        acts on the tenant's instruction under a DPA (bexio, DeepSign)
 * - `subProcessor`     engaged by bkaiser GmbH, not by the tenant (Google, Sentry, imgix)
 * - `jointController`  decides purposes of its own alongside the tenant
 */
export type ProcessorRole = 'processor' | 'subProcessor' | 'jointController';

export type ProcessorCategory = 'infrastructure' | 'saasService' | 'externalParty';

/**
 * The lawful basis for a cross-border transfer (revDSG Art. 16/17).
 *
 * - `domestic`          stays in Switzerland — no transfer question
 * - `adequacyDecision`  recipient country on the Federal Council's adequacy list (EU/EEA)
 * - `scc`               standard contractual clauses / the provider's DPA transfer annex
 * - `consent`           the data subject's explicit consent carries the transfer
 * - `none`              no mechanism declared — audit check 5 reports this as an error
 */
export type TransferMechanism = 'domestic' | 'adequacyDecision' | 'scc' | 'consent' | 'none';

export interface ProcessorEntry {
  /** Stable slug, e.g. `bexio`. Also the key in `AppConfig.integrations`. */
  key: string;
  name: string;
  /** Full legal name and seat, e.g. 'bexio AG, St. Gallen, CH'. */
  legalEntity: string;
  role: ProcessorRole;
  category: ProcessorCategory;
  /** ISO 3166-1 alpha-2 of the seat / processing location. */
  country: string;
  transferMechanism: TransferMechanism;
  /** German, one purpose per line. */
  purposes: string[];
  /** The SAME vocabulary as the subject-data map, so the register and the erasure
   * report describe a transfer with one set of words. */
  dataClasses: DataClass[];
  /** German, e.g. '10 Jahre (GebüV)'. */
  retentionText: string;
  /** German. */
  securityMeasures: string[];
  /** Link to the provider's data-processing agreement. NEVER invent one: an empty
   * string is reported by audit check 5, a fabricated link is not. */
  dpaUrl: string;
  privacyUrl: string;
  /** Where a member writes to exercise their rights against this party directly —
   * rendered in the erasure report's "out of reach" section. */
  contact: string;
}
