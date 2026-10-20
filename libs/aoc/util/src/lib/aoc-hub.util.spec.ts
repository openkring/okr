import { describe, expect, it } from 'vitest';

import { formatValidationErrors, indexDiffs, lastRunsByOperation } from './aoc-hub.util';

describe('lastRunsByOperation', () => {
  it('keeps the newest timestamp per action and skips archived entries', () => {
    const runs = lastRunsByOperation([
      { action: 'validate', timestamp: '20261001120000', isArchived: false },
      { action: 'validate', timestamp: '20261019083000', isArchived: false },
      { action: 'iban', timestamp: '20261005100000', isArchived: false },
      { action: 'iban', timestamp: '20261020100000', isArchived: true },
    ]);
    expect(Object.keys(runs).sort()).toEqual(['iban', 'validate']);
    expect(runs['validate']).toEqual(new Date(2026, 9, 19, 8, 30, 0));
    expect(runs['iban']).toEqual(new Date(2026, 9, 5, 10, 0, 0));
  });

  it('ignores entries without an action or with an unparsable timestamp', () => {
    expect(lastRunsByOperation([
      { action: '', timestamp: '20261001120000', isArchived: false },
      { action: 'reindex', timestamp: 'garbage', isArchived: false },
    ])).toEqual({});
  });
});

describe('indexDiffs', () => {
  it('returns only the models whose generated index differs', () => {
    const models = [
      { okey: 'a', index: 'n:anna' },
      { okey: 'b', index: 'stale' },
      { okey: 'c', index: undefined as unknown as string },
    ];
    const diffs = indexDiffs(models, m => (m.okey === 'a' ? 'n:anna' : 'n:' + m.okey));
    expect(diffs).toEqual([
      { model: models[1], oldIndex: 'stale', newIndex: 'n:b' },
      { model: models[2], oldIndex: '', newIndex: 'n:c' },
    ]);
  });
});

describe('formatValidationErrors', () => {
  it('writes one line per field and message', () => {
    expect(formatValidationErrors({ name: ['zu lang'], tenants: ['fehlt', 'ungültig'] }))
      .toBe('name: zu lang\ntenants: fehlt\ntenants: ungültig');
  });

  it('is empty for no errors', () => {
    expect(formatValidationErrors({})).toBe('');
  });
});
