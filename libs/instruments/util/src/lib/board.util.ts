import { InstrumentTopic } from '@okr/shared-models';
import { rankBetween, rankForIndex } from '@okr/shared-util-core';
import { GridCell, GridDefinition } from './grid.model';

/**
 * The rank-ordered board utilities for the instruments primitive. Generalized from the shipped
 * Kanban board (`libs/task/util/board.util.ts`, 18 Vitest cases): a board cell is a Kanban column,
 * a topic is a task, `cell` is the partition `state` was, and the fractional-rank math is identical.
 */

/** One rendered cell: the grid cell plus its topics in display order. */
export interface BoardCell {
  cell: GridCell;
  topics: InstrumentTopic[];
}

/** A topic's rank, tolerating documents written before the field existed (`undefined` ≡ ''). */
function rankOf(topic: InstrumentTopic): string {
  return topic.rank ?? '';
}

/** Stable tiebreaker for equal / missing ranks: insertion order, approximated by the local key. */
function compareByKey(a: InstrumentTopic, b: InstrumentTopic): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Order the cards of one cell. Ranked topics (explicitly positioned by a drag) come first, in rank
 * order; topics that have never been ranked keep a stable key order behind them. Mirrors
 * `sortTasksByRank` — the board looks right before a single rank exists in the database.
 */
export function sortTopicsByRank(topics: InstrumentTopic[]): InstrumentTopic[] {
  return [...topics].sort((a, b) => {
    const rankA = rankOf(a);
    const rankB = rankOf(b);
    const rankedA = rankA.length > 0;
    const rankedB = rankB.length > 0;
    if (rankedA && rankedB) {
      if (rankA !== rankB) return rankA < rankB ? -1 : 1;
      return compareByKey(a, b);
    }
    if (rankedA) return -1;
    if (rankedB) return 1;
    return compareByKey(a, b);
  });
}

/**
 * Build the board: one `BoardCell` per grid cell, in definition order, each with its sorted topics.
 * A topic whose `cell` matches no grid cell is dropped from the board — that only happens when a
 * grid definition changed under existing data; dropping it is visible and recoverable, silently
 * inventing a cell would not be (same rule as `groupTasksByState`).
 */
export function groupTopicsByCell(topics: InstrumentTopic[], def: GridDefinition): BoardCell[] {
  return def.cells.map(cell => ({
    cell,
    topics: sortTopicsByRank(topics.filter(topic => topic.cell === cell.id)),
  }));
}

/**
 * Give every topic in a cell a rank if any is missing one. Mutates in place and returns only the
 * topics whose rank actually changed, so the caller writes the minimum number of documents. The
 * lazy, self-healing form of a backfill (see `assignMissingRanks` on the Kanban board).
 */
export function assignMissingRanks(cellTopics: InstrumentTopic[]): InstrumentTopic[] {
  if (cellTopics.every(topic => rankOf(topic).length > 0)) return [];
  const changed: InstrumentTopic[] = [];
  cellTopics.forEach((topic, index) => {
    const rank = rankForIndex(index);
    if (topic.rank !== rank) {
      topic.rank = rank;
      changed.push(topic);
    }
  });
  return changed;
}

/**
 * The rank for a topic dropped at `targetIndex` into `cellTopics` — the target cell's topics,
 * ORDERED and WITHOUT the moved topic (exactly what `CdkDragDrop.currentIndex` indexes after the
 * card is taken out). A single value; a move is one field write of `{ cell, rank }`. Mirrors the
 * `rankBetween(previous?.rank, next?.rank)` the Kanban store does on drop.
 */
export function rankForInsertion(cellTopics: InstrumentTopic[], targetIndex: number): string {
  const previous = cellTopics[targetIndex - 1];
  const next = cellTopics[targetIndex];
  return rankBetween(previous?.rank ?? '', next?.rank ?? '');
}
