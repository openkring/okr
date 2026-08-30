import { describe, expect, it } from 'vitest';

import { DOMAIN_MODAL_KEYS, resolveButtonModal } from './modal-registry';

describe('resolveButtonModal', () => {
  it('resolves a form: prefix to the form key', () => {
    expect(resolveButtonModal('form:abc123')).toEqual({ kind: 'form', formKey: 'abc123' });
  });

  it('trims whitespace an admin typed around the value and the key', () => {
    expect(resolveButtonModal(' form: abc123 ')).toEqual({ kind: 'form', formKey: 'abc123' });
  });

  it('rejects an empty form key', () => {
    expect(resolveButtonModal('form:')).toBeUndefined();
    expect(resolveButtonModal('form:   ')).toBeUndefined();
  });

  it('resolves a whitelisted domain-modal key', () => {
    expect(resolveButtonModal('reservation-apply')).toEqual({ kind: 'component', registryKey: 'reservation-apply' });
  });

  it("maps the legacy 'bhres' config an admin typed before the registry existed", () => {
    expect(resolveButtonModal('bhres')).toEqual({ kind: 'component', registryKey: 'reservation-apply' });
  });

  it('returns undefined for anything not whitelisted — a config string must never resolve to an arbitrary component', () => {
    expect(resolveButtonModal('some-other-modal')).toBeUndefined();
    expect(resolveButtonModal('')).toBeUndefined();
    expect(resolveButtonModal('../../evil')).toBeUndefined();
    expect(resolveButtonModal('ReservationApplyModal')).toBeUndefined();
  });

  it('tolerates a missing config without throwing — most buttons carry a url, not a modal', () => {
    expect(resolveButtonModal(undefined as unknown as string)).toBeUndefined();
  });

  it('never resolves a url — a Navigate/Browse button must not open a modal', () => {
    expect(resolveButtonModal('https://example.org/anmeldung')).toBeUndefined();
    expect(resolveButtonModal('/private/reservation/all')).toBeUndefined();
  });

  it('keeps the domain whitelist short and explicit', () => {
    expect([...DOMAIN_MODAL_KEYS]).toEqual(['reservation-apply']);
  });
});
