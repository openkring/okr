import { describe, expect, it } from 'vitest';
import { NewsletterSubscriptionCollection } from '@okr/shared-models';

import { fakeDb, Store } from '../credit/testing/credit-fake-db';
import { activeSubscriberKeys } from './subscribers';

const sub = (personKey: string, fields: Record<string, unknown> = {}) =>
  ({ tenants: ['scs'], groupKey: 'news', personKey, dateOfExit: '', isArchived: false, ...fields });

describe('activeSubscriberKeys', () => {
  const store: Store = {
    [`${NewsletterSubscriptionCollection}/s1`]: sub('active'),
    [`${NewsletterSubscriptionCollection}/s2`]: sub('ended', { dateOfExit: '20261101' }),
    [`${NewsletterSubscriptionCollection}/s3`]: sub('future-exit', { dateOfExit: '20991231' }),
    [`${NewsletterSubscriptionCollection}/s4`]: sub('archived', { isArchived: true }),
    [`${NewsletterSubscriptionCollection}/s5`]: sub('other-tenant', { tenants: ['kring'] }),
    [`${NewsletterSubscriptionCollection}/s6`]: sub('other-group', { groupKey: 'other' }),
    [`${NewsletterSubscriptionCollection}/s7`]: sub('legacy-no-exit', { dateOfExit: undefined }),
    [`${NewsletterSubscriptionCollection}/s8`]: sub(''),
  };

  it('keeps only the active subscribers of this tenant and group', async () => {
    const keys = await activeSubscriberKeys(fakeDb(store), 'scs', 'news');
    expect([...keys].sort()).toEqual(['active', 'legacy-no-exit']);
  });

  it('is empty for a group without subscriptions', async () => {
    expect((await activeSubscriberKeys(fakeDb(store), 'scs', 'none')).size).toBe(0);
  });
});
