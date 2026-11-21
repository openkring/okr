import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => state.db }));

import { fakeDb, Store } from '../credit/testing/credit-fake-db';
import { runNewsletterSignupReap } from './reap-signups';
import { NewsletterSignupCollection } from './types';

const NOW = new Date('2026-11-21T02:00:00+01:00');
const PAST = '20261110120000';
const FUTURE = '20261201120000';

function signup(state: 'pending' | 'confirmed', expiresAt: string): Record<string, unknown> {
  return {
    tenants: ['la21'],
    groupKey: 'g1',
    formKey: 'f1',
    firstName: 'Anna',
    lastName: 'Muster',
    email: 'anna@example.com',
    city: 'Zürich',
    createdAt: '20261101120000',
    expiresAt,
    state,
  };
}

describe('runNewsletterSignupReap', () => {
  let store: Store;

  beforeEach(() => {
    store = {};
    state.db = fakeDb(store);
  });

  it('deletes expired pending signups and keeps a pending, unexpired one', async () => {
    store[`${NewsletterSignupCollection}/expired`] = signup('pending', PAST);
    store[`${NewsletterSignupCollection}/open`] = signup('pending', FUTURE);

    await runNewsletterSignupReap(NOW);

    expect(store[`${NewsletterSignupCollection}/expired`]).toBeUndefined();
    expect(store[`${NewsletterSignupCollection}/open`]).toBeDefined();
  });

  it('deletes every confirmed signup, even when its expiresAt is still in the future', async () => {
    store[`${NewsletterSignupCollection}/confirmedOld`] = signup('confirmed', PAST);
    store[`${NewsletterSignupCollection}/confirmedNew`] = signup('confirmed', FUTURE);

    await runNewsletterSignupReap(NOW);

    expect(store[`${NewsletterSignupCollection}/confirmedOld`]).toBeUndefined();
    expect(store[`${NewsletterSignupCollection}/confirmedNew`]).toBeUndefined();
  });

  it('deletes more than 500 expired signups in batches', async () => {
    for (let i = 0; i < 1203; i++) store[`${NewsletterSignupCollection}/s${i}`] = signup('pending', PAST);

    await runNewsletterSignupReap(NOW);

    expect(Object.keys(store).filter((p) => p.startsWith(`${NewsletterSignupCollection}/`))).toHaveLength(0);
  });

  it('does nothing when no signup is due', async () => {
    store[`${NewsletterSignupCollection}/open`] = signup('pending', FUTURE);

    await runNewsletterSignupReap(NOW);

    expect(Object.keys(store)).toEqual([`${NewsletterSignupCollection}/open`]);
  });
});
