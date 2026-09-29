import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS, DEFAULT_TITLE } from '@okr/shared-constants';
import { OkrModel, SearchableModel } from './base.model';

/**
 * Kreuzworträtsel (spec `2026-09-29-crossword-spec.md`).
 *
 * One tenant-owned collection. A topic embeds its answer/clue pairs AND the grid the admin
 * generated from them, so the two can never drift apart in a partial write. The grid stores no
 * letters — they are derived from `entries[placement.entry].answer`.
 */
export interface CrosswordEntry {
  answer: string;    // as the admin typed it: 'Rückspiegel'
  clue: string;
}

export interface CrosswordPlacement {
  entry: number;                   // index into entries[]
  row: number;                     // 0-based, first cell of the word
  col: number;
  direction: 'across' | 'down';
  number: number;                  // the clue number drawn in that cell
}

export interface CrosswordGrid {
  rows: number;
  cols: number;
  placements: CrosswordPlacement[];
  unplaced: number[];              // entries the generator could not place
}

export class CrosswordTopicModel implements OkrModel, SearchableModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public title = DEFAULT_TITLE;
  public description = DEFAULT_NOTES;
  public language = 'de';
  public state: 'draft' | 'published' = 'draft';
  public entries: CrosswordEntry[] = [];
  public grid: CrosswordGrid | undefined = undefined;
  public gridStale = false;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CrosswordTopicCollection = 'crosswordTopics';
export const CrosswordTopicModelName = 'crosswordTopic';
