import { describe, expect, it } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';
import { DEFAULT_JASS_CONFIG } from './jass.config';
import { createGame } from './jass.engine';
import { formatDuration, jassTiming } from './jass.timing';

const p = (n: number) => ({ avatar: { key: 'k' + n, name1: '', name2: 'P' + n, label: '', modelType: 'person' } as AvatarInfo });
const game = (startedAt: string, finishedAt?: string) =>
  ({ ...createGame('schieber', [p(0), p(1), p(2), p(3)], DEFAULT_JASS_CONFIG, { id: 'g', now: startedAt }), finishedAt });

describe('jassTiming', () => {
  it('reads date, start, end and duration from the stored local times', () => {
    expect(jassTiming(game('20260929193000', '20260929210500'))).toEqual({ date: '29.09.2026', start: '19:30', end: '21:05', minutes: 95 });
  });
  it('has no end and no duration while the game runs', () => {
    expect(jassTiming(game('20260929193000'))).toEqual({ date: '29.09.2026', start: '19:30', end: '', minutes: undefined });
  });
  it('stays empty for a time it cannot read', () => {
    expect(jassTiming(game('2026-09-29T17:30:00.000Z', 'x'))).toEqual({ date: '', start: '', end: '', minutes: undefined });
  });
  it('stamps a new game with the local time in StoreDateTime format', () => {
    expect(createGame('schieber', [p(0), p(1), p(2), p(3)], DEFAULT_JASS_CONFIG).startedAt).toMatch(/^\d{14}$/);
  });
});

describe('formatDuration', () => {
  it.each([[0, '0 min'], [45, '45 min'], [60, '1 h 00 min'], [95, '1 h 35 min'], [undefined, '']])('%s', (m, out) => {
    expect(formatDuration(m)).toBe(out);
  });
});
