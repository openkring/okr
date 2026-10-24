import { describe, expect, it } from 'vitest';
import { passkeyErrorKind } from './passkey-error';

describe('passkeyErrorKind', () => {
  it('maps user cancellation', () => {
    expect(passkeyErrorKind(new DOMException('x', 'NotAllowedError'))).toBe('cancelled');
    expect(passkeyErrorKind(new DOMException('x', 'AbortError'))).toBe('cancelled');
  });
  it('maps an already registered authenticator', () => {
    expect(passkeyErrorKind(new DOMException('x', 'InvalidStateError'))).toBe('exists');
    expect(passkeyErrorKind({ code: 'functions/already-exists' })).toBe('exists');
  });
  it('maps a stale login to reauth', () => {
    expect(passkeyErrorKind({ code: 'functions/failed-precondition', message: 'recent-login-required' })).toBe('reauth');
  });
  it('maps missing support', () => {
    expect(passkeyErrorKind(new DOMException('x', 'NotSupportedError'))).toBe('unsupported');
  });
  it('unwraps WebAuthnError.cause', () => {
    expect(passkeyErrorKind({ name: 'WebAuthnError', cause: new DOMException('x', 'NotAllowedError') })).toBe('cancelled');
    expect(passkeyErrorKind(Object.assign(new Error('x'), { name: 'InvalidStateError' }))).toBe('exists');
  });
  it('falls back to error', () => {
    expect(passkeyErrorKind({ code: 'functions/unauthenticated' })).toBe('error');
    expect(passkeyErrorKind({ code: 'functions/invalid-argument' })).toBe('error');
    expect(passkeyErrorKind({ code: 'functions/failed-precondition', message: 'other' })).toBe('error');
    expect(passkeyErrorKind(undefined)).toBe('error');
  });
});
