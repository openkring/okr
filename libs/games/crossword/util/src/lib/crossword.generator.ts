import { CrosswordEntry, CrosswordGrid, CrosswordPlacement } from '@okr/shared-models';
import { NormalizedEntry, normalizeEntries } from './crossword.normalize';
import { PlacedWord, canPlace, cellsOf } from './crossword.rules';

/** A source of randomness, so tests can pin the generator down. Shaped like `Math.random`. */
export type CrosswordRandom = () => number;

/**
 * How far a re-roll may stray from the most compact layout: up to this many extra rows plus
 * columns of bounding box per placement. Far below the weight of one crossing (100), so a re-roll
 * never trades a crossing for variety — it only picks among layouts that are nearly as compact.
 */
export const REROLL_VARIETY = 4;

/**
 * Lay the topic's entries out as a freeform criss-cross grid.
 *
 * Longest word first at the origin, then every remaining word onto its best legal crossing —
 * most crossings first, most compact second, ties broken by `random`. Because every word after
 * the first sits on a crossing, the result is always a single connected component; islands are
 * structurally impossible.
 *
 * `variety` (0 = the most compact layout) lets a re-roll accept a layout up to that much less
 * compact per placement, so "Neu würfeln" is not a visual no-op whenever the scoring has no exact
 * ties to break. It never costs a crossing — see `REROLL_VARIETY`.
 */
export function generateCrossword(entries: CrosswordEntry[], random: CrosswordRandom = Math.random, variety = 0): CrosswordGrid {
  const { usable, rejected } = normalizeEntries(entries);
  if (usable.length === 0) {
    // build a fresh `placements` array on every call — a shared/module-level empty array here
    // would let one caller's mutation of a returned grid leak into every later call's result
    return { rows: 0, cols: 0, placements: [], unplaced: rejected.map(r => r.index).sort((a, b) => a - b) };
  }

  const queue = [...usable].sort((a, b) => b.answer.length - a.answer.length);
  const placed: PlacedWord[] = [{ entry: queue[0].index, answer: queue[0].answer, row: 0, col: 0, direction: 'across' }];
  const unplaced: number[] = rejected.map(r => r.index);

  for (const candidate of queue.slice(1)) {
    const best = bestPlacement(placed, candidate, random, variety);
    if (best) placed.push(best); else unplaced.push(candidate.index);
  }

  return finalise(placed, unplaced);
}

/**
 * Every legal placement of `candidate`, scored; the winner, or undefined when there is none. With
 * `variety` > 0 every option within `variety` points of the best is a candidate winner.
 */
function bestPlacement(placed: PlacedWord[], candidate: NormalizedEntry, random: CrosswordRandom, variety: number): PlacedWord | undefined {
  const options: { word: PlacedWord; score: number }[] = [];

  for (const word of placed) {
    const wordCells = cellsOf(word);
    for (let i = 0; i < word.answer.length; i++) {
      for (let j = 0; j < candidate.answer.length; j++) {
        if (word.answer[i] !== candidate.answer[j]) continue;
        const direction = word.direction === 'across' ? 'down' : 'across';
        const anchor = wordCells[i];
        const trial: PlacedWord = direction === 'down'
          ? { entry: candidate.index, answer: candidate.answer, row: anchor.row - j, col: anchor.col, direction }
          : { entry: candidate.index, answer: candidate.answer, row: anchor.row, col: anchor.col - j, direction };
        if (!canPlace(placed, trial)) continue;
        options.push({ word: trial, score: scoreOf(placed, trial) });
      }
    }
  }

  if (options.length === 0) return undefined;
  const best = Math.max(...options.map(o => o.score));
  const winners = options.filter(o => o.score >= best - variety);
  return winners[Math.floor(random() * winners.length) % winners.length].word;
}

/** More crossings is better; a tighter bounding box breaks the tie. */
function scoreOf(placed: PlacedWord[], trial: PlacedWord): number {
  const occupied = new Set(placed.flatMap(w => cellsOf(w).map(c => `${c.row},${c.col}`)));
  const crossings = cellsOf(trial).filter(c => occupied.has(`${c.row},${c.col}`)).length;
  const all = [...placed, trial].flatMap(cellsOf);
  const height = Math.max(...all.map(c => c.row)) - Math.min(...all.map(c => c.row)) + 1;
  const width = Math.max(...all.map(c => c.col)) - Math.min(...all.map(c => c.col)) + 1;
  return crossings * 100 - (height + width);
}

/** Shift to a 0-based bounding box and assign clue numbers row-major. */
function finalise(placed: PlacedWord[], unplaced: number[]): CrosswordGrid {
  const all = placed.flatMap(cellsOf);
  const minRow = Math.min(...all.map(c => c.row));
  const minCol = Math.min(...all.map(c => c.col));
  const shifted = placed.map(w => ({ ...w, row: w.row - minRow, col: w.col - minCol }));

  const ordered = [...shifted].sort((a, b) => a.row - b.row || a.col - b.col);
  const numbers = new Map<string, number>();
  let next = 1;
  const placements: CrosswordPlacement[] = ordered.map(w => {
    const cell = `${w.row},${w.col}`;
    if (!numbers.has(cell)) numbers.set(cell, next++);
    return { entry: w.entry, row: w.row, col: w.col, direction: w.direction, number: numbers.get(cell) as number };
  });

  const cells = shifted.flatMap(cellsOf);
  return {
    rows: Math.max(...cells.map(c => c.row)) + 1,
    cols: Math.max(...cells.map(c => c.col)) + 1,
    placements,
    unplaced: unplaced.sort((a, b) => a - b),
  };
}

/**
 * True when two grids place every word on the same cells in the same direction — the admin would
 * see no difference. Clue numbers follow from the positions, so they are not compared.
 */
export function sameLayout(a: CrosswordGrid, b: CrosswordGrid): boolean {
  if (a.rows !== b.rows || a.cols !== b.cols || a.placements.length !== b.placements.length) return false;
  const signature = (grid: CrosswordGrid): string[] =>
    grid.placements.map(p => `${p.entry}:${p.row},${p.col},${p.direction}`).sort();
  const sa = signature(a);
  const sb = signature(b);
  return sa.every((value, i) => value === sb[i]);
}
