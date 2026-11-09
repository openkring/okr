import { describe, expect, it } from 'vitest';
import type { SendingState } from '@okr/shared-models';

import {
  filterSendings, lastSendingAt, mailingKeyOfSource, sendingHasTask, sendingPeriodStart, sendingStatusLabelKey, sendingStatusOf,
  sortSendingsNewestFirst, summarizeSendings, summaryParts,
} from './sending.util';

const rec = (state: SendingState, createdAt = '2026-11-01T10:00:00.000Z') => ({ state, createdAt });

describe('sending.util', () => {
  it('folds queued, submitting and submitted into «in production»', () => {
    expect((['queued', 'submitting', 'submitted'] as SendingState[]).map(sendingStatusOf)).toEqual(['inProduction', 'inProduction', 'inProduction']);
    expect(sendingStatusOf('sent')).toBe('sent');
    expect(sendingStatusOf('delivered')).toBe('delivered');
    expect(sendingStatusOf('failed')).toBe('problem');
    expect(sendingStatusOf('undeliverable')).toBe('undeliverable');
  });

  it('maps each status to its label key', () => {
    expect(sendingStatusLabelKey('inProduction')).toBe('status_in_production');
    expect(sendingStatusLabelKey('problem')).toBe('status_problem');
    expect(sendingStatusLabelKey('undeliverable')).toBe('status_undeliverable');
  });

  it('summarizes counts per status', () => {
    const s = summarizeSendings([rec('queued'), rec('submitted'), rec('sent'), rec('sent'), rec('delivered'), rec('failed'), rec('undeliverable')]);
    expect(s).toEqual({ total: 7, inProduction: 2, sent: 2, delivered: 1, problem: 1, undeliverable: 1 });
    expect(summarizeSendings([]).total).toBe(0);
  });

  it('omits zero parts', () => {
    expect(summaryParts(summarizeSendings([rec('sent'), rec('failed')]))).toEqual([{ status: 'sent', count: 1 }, { status: 'problem', count: 1 }]);
  });

  it('flags the states that carry a task', () => {
    expect(sendingHasTask('failed')).toBe(true);
    expect(sendingHasTask('undeliverable')).toBe(true);
    expect(sendingHasTask('sent')).toBe(false);
  });

  it('sorts newest first without mutating', () => {
    const input = [rec('sent', '2026-01-01'), rec('sent', '2026-03-01'), rec('sent', '2026-02-01')];
    expect(sortSendingsNewestFirst(input).map((r) => r.createdAt)).toEqual(['2026-03-01', '2026-02-01', '2026-01-01']);
    expect(input[0].createdAt).toBe('2026-01-01');
  });

  it('filters by status and period', () => {
    const now = new Date('2026-11-09T00:00:00.000Z');
    const records = [rec('sent', '2026-11-05T00:00:00.000Z'), rec('failed', '2026-11-05T00:00:00.000Z'), rec('sent', '2026-06-01T00:00:00.000Z')];
    expect(filterSendings(records, 'all', 'all', now)).toHaveLength(3);
    expect(filterSendings(records, 'sent', 'all', now)).toHaveLength(2);
    expect(filterSendings(records, 'all', 'days30', now)).toHaveLength(2);
    expect(filterSendings(records, 'problem', 'days30', now)).toHaveLength(1);
    expect(sendingPeriodStart('all', now)).toBe('');
  });

  it('takes the date of the last history entry', () => {
    expect(lastSendingAt({ history: [{ state: 'queued', at: 'a' }, { state: 'sent', at: 'b' }], updatedAt: 'u', createdAt: 'c' })).toBe('b');
    expect(lastSendingAt({ history: [], updatedAt: 'u', createdAt: 'c' })).toBe('u');
  });

  it('extracts the mailing key of a source', () => {
    expect(mailingKeyOfSource('mailing.abc')).toBe('abc');
    expect(mailingKeyOfSource('invoice.abc')).toBe('');
  });
});
