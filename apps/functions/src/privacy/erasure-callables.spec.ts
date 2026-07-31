import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import {
  assertExecutable, countOtherAdmins, renderAdminNotification, toEraseResponse,
} from './erasure-callables';
import type { ErasurePreview } from './erasure-preview';
import type { ErasureResult } from './erasure-execute';

const preview = (over: Partial<ErasurePreview> = {}): ErasurePreview => ({
  blockers: [], willDelete: [], willAnonymize: [], willRetain: [], canDeleteNow: [],
  outOfReach: [], previewToken: 'tok-1', ...over,
});

function userDoc(id: string, roles: Record<string, boolean>): DocumentSnapshot {
  return {
    id,
    get: (path: string) => path.split('.')
      .reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), { roles }),
  } as unknown as DocumentSnapshot;
}

describe('assertExecutable', () => {
  it('passes when the token matches and nothing blocks', () => {
    expect(() => assertExecutable(preview(), 'tok-1')).not.toThrow();
  });

  it('refuses a confirmation given for a different situation', () => {
    expect(() => assertExecutable(preview(), 'tok-stale')).toThrow(HttpsError);
    expect(() => assertExecutable(preview(), 'tok-stale')).toThrow(/geändert/);
  });

  it('refuses a missing token — a client that never previewed cannot erase', () => {
    expect(() => assertExecutable(preview(), undefined)).toThrow(HttpsError);
    expect(() => assertExecutable(preview(), '')).toThrow(HttpsError);
  });

  it('refuses while a blocker stands, even with a matching token', () => {
    const blocked = preview({
      blockers: [{ code: 'openInvoice', count: 1, detail: 'offen', blocksTiers: ['T1', 'T3'] }],
    });
    expect(() => assertExecutable(blocked, 'tok-1')).toThrow(HttpsError);
  });
});

describe('countOtherAdmins', () => {
  it('counts the tenant admins other than the caller', () => {
    const users = [
      userDoc('u1', { admin: true }),      // the caller
      userDoc('u2', { admin: true }),
      userDoc('u3', { memberAdmin: true }),
      userDoc('u4', {}),
    ];
    expect(countOtherAdmins(users, 'u1')).toBe(1);
  });

  it('is zero when the caller is the only admin', () => {
    expect(countOtherAdmins([userDoc('u1', { admin: true }), userDoc('u2', {})], 'u1')).toBe(0);
  });

  it('tolerates a legacy user doc with no roles map at all', () => {
    const legacy = { id: 'u2', get: () => undefined } as unknown as DocumentSnapshot;
    expect(countOtherAdmins([legacy], 'u1')).toBe(0);
  });
});

describe('toEraseResponse', () => {
  const result: ErasureResult = {
    executedAt: '20260729120000',
    pseudonym: 'Gelöschtes Mitglied #abc12345',
    counts: { sessions: 3 },
    addressesDetached: 2,
    addressesDeleted: 1,
    personDeleted: false,
    authUserDeleted: false,
  };

  // D-P5-2: `personDeleted: false` tells the caller their person record survived, which
  // can only be because another tenancy holds it. The response must read identically
  // either way.
  it('never forwards whether the person record or the login survived', () => {
    const response = toEraseResponse(result);
    expect(Object.keys(response).sort()).toEqual(['counts', 'executedAt', 'pseudonym']);
  });

  it('reads identically whether or not another tenancy remains', () => {
    expect(toEraseResponse({ ...result, personDeleted: false, authUserDeleted: false }))
      .toEqual(toEraseResponse({ ...result, personDeleted: true, authUserDeleted: true }));
  });
});

describe('renderAdminNotification', () => {
  const mail = renderAdminNotification('Seeclub Stäfa', '20260729120000');

  it('states what happened and when', () => {
    expect(mail.subject).toContain('Datenlöschung');
    expect(mail.html).toContain('29.07.2026');
    expect(mail.html).toContain('Seeclub Stäfa');
  });

  it('says the accounting records were pseudonymized rather than deleted', () => {
    expect(mail.html).toMatch(/pseudonymisiert/i);
  });

  // The notification must not reintroduce the identity that was just erased — not the
  // name, not the e-mail, and not the pseudonym either, which is a stable handle back
  // into the anonymized accounting records.
  it('names nobody', () => {
    const withSubject = renderAdminNotification('Seeclub Stäfa', '20260729120000');
    expect(withSubject.html).not.toMatch(/Gelöschtes Mitglied #/);
    expect(renderAdminNotification.length, 'the renderer takes no subject argument at all').toBe(2);
  });
});
