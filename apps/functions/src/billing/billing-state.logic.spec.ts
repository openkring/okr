/** Subscription state machine (plan 2 Task 5, design §7.4 / 1.134 §3). */
import { describe, expect, it } from 'vitest';
import type { SubscriptionState } from '@okr/shared-models';

import { applyEvents, nextRetryDate, nextState, RETRY_DAYS } from './billing-state.logic';

const sub = (state: SubscriptionState, pastDueSince = '', closingSince = '') => ({ state, pastDueSince, closingSince });
const TODAY = '20261210';

describe('nextState', () => {
  it('active + chargeFailed → pastDue since today', () => {
    expect(nextState(sub('active'), { kind: 'chargeFailed', today: TODAY })).toEqual(sub('pastDue', TODAY));
  });
  it('active + dueDatePassedUnpaid → pastDue since today', () => {
    expect(nextState(sub('active'), { kind: 'dueDatePassedUnpaid', today: TODAY })).toEqual(sub('pastDue', TODAY));
  });
  it('pastDue + chargeFailed keeps its pastDueSince', () => {
    expect(nextState(sub('pastDue', '20261201'), { kind: 'chargeFailed', today: TODAY })).toEqual(sub('pastDue', '20261201'));
  });
  it('pastDue + allPaid → active, dates cleared', () => {
    expect(nextState(sub('pastDue', '20261201'), { kind: 'allPaid' })).toEqual(sub('active'));
  });
  it('closing + allPaid → active, dates cleared', () => {
    expect(nextState(sub('closing', '20261101', '20261201'), { kind: 'allPaid' })).toEqual(sub('active'));
  });
  it('active + allPaid stays active', () => {
    expect(nextState(sub('active'), { kind: 'allPaid' })).toEqual(sub('active'));
  });
  it('pastDue → closing after exactly 30 days, not 29', () => {
    const s = sub('pastDue', '20261101');
    expect(nextState(s, { kind: 'day', today: '20261130' })).toEqual(s); // 29 days
    expect(nextState(s, { kind: 'day', today: '20261201' })).toEqual(sub('closing', '20261101', '20261201')); // 30 days
  });
  it('pastDue → closing on a later day when a run was missed', () => {
    expect(nextState(sub('pastDue', '20261101'), { kind: 'day', today: '20261203' })).toEqual(sub('closing', '20261101', '20261203'));
  });
  it('closing → closed after exactly 30 days, not 29', () => {
    const s = sub('closing', '20261101', '20261201');
    expect(nextState(s, { kind: 'day', today: '20261230' })).toEqual(s);
    expect(nextState(s, { kind: 'day', today: '20261231' })).toEqual(sub('closed', '20261101', '20261201'));
  });
  it('closing + chargeFailed / dueDatePassedUnpaid change nothing', () => {
    const s = sub('closing', '20261101', '20261201');
    expect(nextState(s, { kind: 'chargeFailed', today: TODAY })).toEqual(s);
    expect(nextState(s, { kind: 'dueDatePassedUnpaid', today: TODAY })).toEqual(s);
  });
  it('a pastDue without a date never closes (a broken doc is not guessed)', () => {
    expect(nextState(sub('pastDue'), { kind: 'day', today: TODAY })).toEqual(sub('pastDue'));
  });
  it.each(['cancelled', 'closed'] as const)('%s never changes by events', (state) => {
    const s = sub(state, '20261001', '20261101');
    for (const e of [
      { kind: 'chargeFailed', today: TODAY }, { kind: 'dueDatePassedUnpaid', today: TODAY }, { kind: 'allPaid' }, { kind: 'day', today: '20271231' },
    ] as const) expect(nextState(s, e)).toEqual(s);
  });
});

describe('applyEvents', () => {
  it('applies the events in order (first failure, then the day)', () => {
    expect(applyEvents(sub('active'), [{ kind: 'chargeFailed', today: TODAY }, { kind: 'day', today: TODAY }])).toEqual(sub('pastDue', TODAY));
  });
});

describe('nextRetryDate', () => {
  it('retries on day 3, 7 and 14 after the issue date, then never', () => {
    expect(RETRY_DAYS).toEqual([3, 7, 14]);
    expect(nextRetryDate('20261201', 0)).toBe('20261204');
    expect(nextRetryDate('20261201', 1)).toBe('20261208');
    expect(nextRetryDate('20261201', 2)).toBe('20261215');
    expect(nextRetryDate('20261201', 3)).toBe('');
  });
});
