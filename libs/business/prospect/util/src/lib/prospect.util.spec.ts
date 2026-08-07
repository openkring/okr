import { describe, expect, it } from 'vitest';
import { ProspectModel } from '@okr/shared-models';
import {
  CLAIM_MONTHS, canClaim, claimProspect, convertProspect, isClaimExpired, isInPool,
  isVisibleToPartner, releaseClaim, retentionDueDate, revokeConsent,
} from './prospect.util';

const TODAY = '20260807';
const IN_THREE_MONTHS = '20261107';

const prospect = (over: Partial<ProspectModel> = {}): ProspectModel =>
  Object.assign(new ProspectModel('kring'), { okey: 'p1', name: 'Turnverein Musterhausen' }, over);

const claimed = (over: Partial<ProspectModel> = {}): ProspectModel => prospect({
  status: 'claimed', claimedByPartnerKey: 'partnerA', claimedAt: TODAY,
  claimExpiresAt: IN_THREE_MONTHS, ...over,
});

describe('claiming is deal registration (§1, §3)', () => {
  it('claims an open lead and protects it for three months', () => {
    const result = claimProspect(prospect(), 'partnerA', TODAY);
    expect(result.ok).toBe(true);
    expect(result.prospect.status).toBe('claimed');
    expect(result.prospect.claimedByPartnerKey).toBe('partnerA');
    expect(result.prospect.claimExpiresAt).toBe(IN_THREE_MONTHS);
    expect(CLAIM_MONTHS).toBe(3);
  });

  it('refuses a second partner — first claim wins (§3)', () => {
    // C5 §6's acceptance case: partner B can no longer claim what partner A holds.
    const result = claimProspect(claimed(), 'partnerB', TODAY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('already-claimed');
  });

  it('leaves the record untouched when it refuses', () => {
    // Two partners racing must not both half-write. A refused claim returns the input verbatim.
    const held = claimed();
    expect(claimProspect(held, 'partnerB', TODAY).prospect).toBe(held);
  });

  it('never claims a withdrawn lead', () => {
    const result = claimProspect(prospect({ status: 'withdrawn', revokedAt: TODAY }), 'partnerA', TODAY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('withdrawn');
  });
});

describe('the three-month window (§3, §6)', () => {
  it('is not expired the day before', () => {
    expect(isClaimExpired(claimed(), '20261106')).toBe(false);
  });

  it('is expired on the day itself', () => {
    expect(isClaimExpired(claimed(), IN_THREE_MONTHS)).toBe(true);
  });

  it('reappears for both partners after three months without conversion', () => {
    const stale = claimed();
    expect(canClaim(stale, IN_THREE_MONTHS)).toBe(true);
    expect(isVisibleToPartner(stale, 'partnerB', IN_THREE_MONTHS)).toBe(true);
    expect(claimProspect(stale, 'partnerB', IN_THREE_MONTHS).ok).toBe(true);
  });

  it('is claimable again before the sweep has run — expiry is a fact about the date', () => {
    // The scheduled release job may lag; a partner asking on the right day must not be told no.
    expect(isInPool(claimed(), IN_THREE_MONTHS)).toBe(true);
  });
});

describe('release: expiry and early decline end differently on purpose', () => {
  it('marks an expired claim as expired', () => {
    expect(releaseClaim(claimed()).status).toBe('expired');
  });

  it('returns a declined lead straight to open', () => {
    // "gave it back" and "sat on it for three months" are different facts about the partner.
    expect(releaseClaim(claimed(), true).status).toBe('open');
  });

  it('clears the holder either way', () => {
    expect(releaseClaim(claimed()).claimedByPartnerKey).toBe('');
  });

  it('does nothing to a lead that is not claimed', () => {
    const open = prospect();
    expect(releaseClaim(open)).toBe(open);
  });
});

describe('conversion is observed, never self-declared (§7)', () => {
  it('converts on a metering push from the holder', () => {
    const converted = convertProspect(claimed(), 'partnerA', 'tvm', TODAY);
    expect(converted?.status).toBe('converted');
    expect(converted?.convertedTenantId).toBe('tvm');
  });

  it('refuses a push from a partner who does not hold the lead', () => {
    // The whole anti-self-declaration property: you cannot convert what you do not hold.
    expect(convertProspect(claimed(), 'partnerB', 'tvm', TODAY)).toBeUndefined();
  });

  it('refuses to convert an unclaimed lead', () => {
    expect(convertProspect(prospect(), 'partnerA', 'tvm', TODAY)).toBeUndefined();
  });

  it('takes a converted lead out of the pool for good', () => {
    const converted = convertProspect(claimed(), 'partnerA', 'tvm', TODAY);
    expect(isInPool(converted as ProspectModel, '20990101')).toBe(false);
  });
});

describe('a revocation beats an active claim, immediately (§7)', () => {
  it('withdraws the lead and names the partner to notify', () => {
    const { prospect: after, partnerToNotify } = revokeConsent(claimed(), TODAY);
    expect(after.status).toBe('withdrawn');
    expect(after.revokedAt).toBe(TODAY);
    expect(after.claimedByPartnerKey).toBe('');
    expect(partnerToNotify).toBe('partnerA');
  });

  it('has nobody to notify when the lead was never claimed', () => {
    expect(revokeConsent(prospect(), TODAY).partnerToNotify).toBe('');
  });

  it('hides a withdrawn lead from everyone, including its former holder', () => {
    const { prospect: after } = revokeConsent(claimed(), TODAY);
    expect(isVisibleToPartner(after, 'partnerA', TODAY)).toBe(false);
    expect(isInPool(after, TODAY)).toBe(false);
  });
});

describe('row-level visibility (§5)', () => {
  it('shows a partner the open pool', () => {
    expect(isVisibleToPartner(prospect(), 'partnerB', TODAY)).toBe(true);
  });

  it('shows a partner their own claim', () => {
    expect(isVisibleToPartner(claimed(), 'partnerA', TODAY)).toBe(true);
  });

  it("hides another partner's claim", () => {
    expect(isVisibleToPartner(claimed(), 'partnerB', TODAY)).toBe(false);
  });
});

describe('retention (§7) — 24 months from last contact', () => {
  it('is two years out', () => {
    expect(retentionDueDate('20260807')).toBe('20280807');
  });
});
