import { describe, expect, it } from 'vitest';
import { isReapableExportArtifact, REAP_MAX_AGE_MS } from './reap-exports';

const now = Date.parse('2026-07-28T12:00:00.000Z');
const oneDayAgoIso = new Date(now - REAP_MAX_AGE_MS - 1000).toISOString();
const oneHourAgoIso = new Date(now - 60 * 60 * 1000).toISOString();

describe('isReapableExportArtifact', () => {
  it('reaps an old export artifact', () => {
    const name = `tenant/scs/private/exports/uid1/${oneDayAgoIso}-token.zip`;
    expect(isReapableExportArtifact(name, oneDayAgoIso, now)).toBe(true);
  });

  it('does NOT reap a fresh export artifact (rate-limit window, not yet 24h old)', () => {
    const name = 'tenant/scs/private/exports/uid1/stamp-token.zip';
    expect(isReapableExportArtifact(name, oneHourAgoIso, now)).toBe(false);
  });

  it('is structurally incapable of deleting tenant data — wrong prefix, however old, is never reaped', () => {
    const name = 'tenant/scs/avatars/person.p1.png'; // ordinary tenant data, ancient
    expect(isReapableExportArtifact(name, oneDayAgoIso, now)).toBe(false);
  });

  it('does not reap a path that merely contains "exports" without the full private/exports/ segment', () => {
    const name = 'tenant/scs/documents/exports/report.pdf'; // NOT under private/exports/
    expect(isReapableExportArtifact(name, oneDayAgoIso, now)).toBe(false);
  });

  it('does not reap a private/exports/ path for another tenant sub-area name collision guard', () => {
    // sanity: a legit export path for a different tenant/uid is still reaped on age alone —
    // the predicate is intentionally prefix-only, not tenant/uid-scoped (any tenant's stale
    // export is fair game for the daily sweep).
    const name = 'tenant/other-tenant/private/exports/uid9/stamp-token.zip';
    expect(isReapableExportArtifact(name, oneDayAgoIso, now)).toBe(true);
  });

  it('treats a missing/invalid timeCreated as not reapable (never delete on missing metadata)', () => {
    const name = 'tenant/scs/private/exports/uid1/stamp-token.zip';
    expect(isReapableExportArtifact(name, undefined, now)).toBe(false);
  });

  it('does not reap exactly at the 24h boundary (only strictly older)', () => {
    const boundaryIso = new Date(now - REAP_MAX_AGE_MS).toISOString();
    expect(isReapableExportArtifact(nameAtBoundary(boundaryIso), boundaryIso, now)).toBe(false);
  });

  it('reaps just past the 24h boundary', () => {
    const pastIso = new Date(now - REAP_MAX_AGE_MS - 1).toISOString();
    expect(isReapableExportArtifact(nameAtBoundary(pastIso), pastIso, now)).toBe(true);
  });
});

function nameAtBoundary(iso: string): string {
  return `tenant/scs/private/exports/uid1/${iso}-token.zip`;
}
