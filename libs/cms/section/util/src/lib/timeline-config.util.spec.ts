import { describe, expect, it } from 'vitest';

import { CalEventModel } from '@okr/shared-models';
import { toTimelineEntries, withTimelineDefaults } from './timeline-config.util';

const event = (over: Partial<CalEventModel> = {}): CalEventModel =>
  ({ okey: 'k1', name: 'Gründung', startDate: '20200101', url: '', ...over }) as CalEventModel;

describe('withTimelineDefaults', () => {
  it('falls back to horizontal for a legacy document', () => {
    expect(withTimelineDefaults(undefined)).toEqual({ orientation: 'horizontal' });
  });

  it('keeps the configured orientation', () => {
    expect(withTimelineDefaults({ orientation: 'vertical' })).toEqual({ orientation: 'vertical' });
  });
});

describe('toTimelineEntries', () => {
  it('sorts oldest first and maps url to the image', () => {
    const entries = toTimelineEntries([
      event({ okey: 'b', startDate: '20240301' }),
      event({ okey: 'a', startDate: '20200101', url: 'https://img/1.jpg' }),
    ]);
    expect(entries.map((e) => e.okey)).toEqual(['a', 'b']);
    expect(entries[0].imageUrl).toBe('https://img/1.jpg');
    expect(entries[1].imageUrl).toBe('');
  });

  it('drops events without a date', () => {
    expect(toTimelineEntries([event({ startDate: '' })])).toEqual([]);
  });

  it('returns an empty list for undefined', () => {
    expect(toTimelineEntries(undefined)).toEqual([]);
  });
});
