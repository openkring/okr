import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { NamedModel, OkrModel, SearchableModel, TaggedModel } from './base.model';
import { PartnerSegment } from './metering.model';

/**
 * Where a lead stands. `open` and `claimed` are the only two states a partner acts on; the other
 * three are terminal for the pool.
 *
 * `withdrawn` exists because a consent revocation must be a visible state and not a silent
 * disappearance: the claiming partner has to be told to stop contacting the person, and an entry
 * that merely vanished would look like someone else's claim.
 */
export type ProspectStatus = 'open' | 'claimed' | 'converted' | 'expired' | 'withdrawn';

/**
 * `prospects/{okey}` — one lead from kring.ch or the `okr` demo signup, in tenant `kring` (C5).
 *
 * **Claiming a lead IS deal registration** (C5 §1) — one mechanism, not two. The pool is open to
 * every partner, first claim wins, and a claim that does not convert within three months returns to
 * open competition.
 *
 * ⚠️ **Contact details are NOT fields here.** They are `AddressModel`s with
 * `parentKey = 'prospect.<okey>'`, written through `AddressService` (C5 §5) — the same PII vault,
 * the same rules and the same erasure path as every other contact datum. A prospect deliberately
 * gets no `address-directory` projection: that projection is the member directory, and a lead is
 * not a member. The only person-identifying string kept here is `contactName`, because a name is
 * not an address and the pool list is unusable without one.
 *
 * A prospect is a **natural person** and their disclosure to a partner is a third-party transfer,
 * so this collection has a row in `subject-data-map.ts` — without it, it would be invisible to
 * export and survive erasure silently (1.19 D-P5-3).
 */
export class ProspectModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  /** The organisation the lead is for — a Verein that may not exist as an `Org` yet. */
  public name = DEFAULT_NAME;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public segment: PartnerSegment = 'club';
  /** The person who signed up. Their e-mail/phone live in `addresses`, not here. */
  public contactName = '';
  /** Where the lead came from — `kring.ch`, `okr-demo`, `event`, … Free text, for reporting only. */
  public source = '';

  public status: ProspectStatus = 'open';

  /** `PartnerModel.okey` of the holder while `status === 'claimed'`; '' in every other state. */
  public claimedByPartnerKey = '';
  public claimedAt = '';
  /** Claim + 3 months (C5 §3). Compared as a `DateFormat` store string, never as a Date. */
  public claimExpiresAt = '';

  /**
   * The partner tenant id this lead became, once a C3 metering push reports it (C5 §7, decided
   * 2026-08-07: conversion is **observed**, never self-declared). Set together with
   * `status: 'converted'`.
   */
  public convertedTenantId = '';
  public convertedAt = '';

  /**
   * Consent is the legal basis (Vertragswerk Teil III.2), so both ends of it are recorded:
   * when it was given, and when it was revoked. A revocation is effective against bkaiser
   * immediately; the claiming partner became an independent controller on receipt and answers
   * for their own copy — which is exactly what the notice tells the person.
   */
  public consentAt = '';
  public revokedAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ProspectCollection = 'prospects';
export const ProspectModelName = 'prospect';

/** `AddressModel.parentKey` prefix for a prospect's contact data (see the class doc comment). */
export const PROSPECT_PARENT_PREFIX = 'prospect';
