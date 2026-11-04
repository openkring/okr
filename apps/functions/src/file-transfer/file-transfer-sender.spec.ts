import { describe, expect, it } from 'vitest';

import type { UserModel } from '@okr/shared-models';

import { mayCreateFileTransfer } from './file-transfer-sender';

// Spec 1.115 §4.2 — who may create a transfer: registered by role hierarchy, never kiosk-only.
const user = (roles?: Record<string, boolean>): Partial<UserModel> => ({ personKey: 'p1', roles } as Partial<UserModel>);

describe('mayCreateFileTransfer', () => {
  it('allows a registered user', () => {
    expect(mayCreateFileTransfer(user({ registered: true }))).toBe(true);
  });

  it('allows an admin whose doc carries only roles.admin (the 403 of 2026-11-02)', () => {
    expect(mayCreateFileTransfer(user({ admin: true }))).toBe(true);
  });

  it('allows other roles that imply registered', () => {
    expect(mayCreateFileTransfer(user({ privileged: true }))).toBe(true);
    expect(mayCreateFileTransfer(user({ contentAdmin: true }))).toBe(true);
  });

  it('refuses a kiosk-only user', () => {
    expect(mayCreateFileTransfer(user({ kiosk: true }))).toBe(false);
  });

  it('allows a kiosk user who also holds another role', () => {
    expect(mayCreateFileTransfer(user({ kiosk: true, registered: true }))).toBe(true);
  });

  it('refuses a user without any role', () => {
    expect(mayCreateFileTransfer(user({}))).toBe(false);
  });

  it('refuses, without throwing, a users doc that has no roles field', () => {
    expect(mayCreateFileTransfer(user(undefined))).toBe(false);
  });

  it('refuses a missing users doc', () => {
    expect(mayCreateFileTransfer(undefined)).toBe(false);
  });
});
