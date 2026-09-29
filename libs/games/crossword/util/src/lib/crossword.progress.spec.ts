import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrosswordGrid } from '@okr/shared-models';
import { loadProgress, saveProgress } from './crossword.progress';

const grid: CrosswordGrid = { rows: 2, cols: 2, placements: [], unplaced: [] };

describe('crossword progress', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the filled letters', () => {
    saveProgress('topic-1', grid, new Map([['0,0', 'R']]));
    expect(loadProgress('topic-1', grid)).toEqual(new Map([['0,0', 'R']]));
  });

  it('returns an empty map when nothing was saved', () => {
    expect(loadProgress('unknown', grid)).toEqual(new Map());
  });

  it('discards progress saved against different grid dimensions', () => {
    saveProgress('topic-1', grid, new Map([['0,0', 'R']]));
    expect(loadProgress('topic-1', { ...grid, cols: 9 })).toEqual(new Map());
  });

  it('restores progress when the layout is unchanged', () => {
    const layout: CrosswordGrid = {
      rows: 5,
      cols: 5,
      placements: [{ entry: 0, row: 0, col: 0, direction: 'across', number: 1 }],
      unplaced: [],
    };
    saveProgress('topic-1', layout, new Map([['0,0', 'R']]));
    expect(loadProgress('topic-1', layout)).toEqual(new Map([['0,0', 'R']]));
  });

  it('discards progress when dimensions match but the layout differs (regenerated grid)', () => {
    const before: CrosswordGrid = {
      rows: 5,
      cols: 5,
      placements: [{ entry: 0, row: 0, col: 0, direction: 'across', number: 1 }],
      unplaced: [],
    };
    const after: CrosswordGrid = {
      rows: 5,
      cols: 5,
      placements: [{ entry: 1, row: 2, col: 1, direction: 'down', number: 1 }],
      unplaced: [],
    };
    saveProgress('topic-1', before, new Map([['0,0', 'R']]));
    expect(loadProgress('topic-1', after)).toEqual(new Map());
  });

  it('discards a blob saved by the old format (no fingerprint field)', () => {
    localStorage.setItem('okr.crossword.topic-1', JSON.stringify({
      rows: grid.rows,
      cols: grid.cols,
      filled: [['0,0', 'R']],
    }));
    expect(loadProgress('topic-1', grid)).toEqual(new Map());
  });

  it('returns an empty map on malformed JSON instead of throwing', () => {
    localStorage.setItem('okr.crossword.topic-1', '{not json');
    expect(() => loadProgress('topic-1', grid)).not.toThrow();
    expect(loadProgress('topic-1', grid)).toEqual(new Map());
  });

  it('survives a localStorage that throws on access', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadProgress('topic-1', grid)).toEqual(new Map());
    spy.mockRestore();
  });

  it('never throws when saving is denied', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveProgress('topic-1', grid, new Map([['0,0', 'R']]))).not.toThrow();
    spy.mockRestore();
  });
});
