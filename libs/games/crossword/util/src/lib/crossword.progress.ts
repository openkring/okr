import { CrosswordGrid } from '@okr/shared-models';

interface StoredProgress {
  rows: number;
  cols: number;
  filled: [string, string][];
}

const storageKey = (okey: string): string => `okr.crossword.${okey}`;

/**
 * The letters this device has typed for a topic. Per browser, never in Firestore.
 *
 * Every read is defensive: a private window, cleared site data, a browser blocking storage, or
 * a grid that was regenerated under a saved blob must all start a clean puzzle rather than
 * break the page.
 */
export function loadProgress(okey: string, grid: CrosswordGrid): Map<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(okey));
    if (!raw) return new Map();
    const stored = JSON.parse(raw) as StoredProgress;
    if (stored.rows !== grid.rows || stored.cols !== grid.cols) return new Map();
    return new Map(stored.filled);
  } catch {
    return new Map();
  }
}

export function saveProgress(okey: string, grid: CrosswordGrid, filled: Map<string, string>): void {
  try {
    const payload: StoredProgress = { rows: grid.rows, cols: grid.cols, filled: [...filled.entries()] };
    localStorage.setItem(storageKey(okey), JSON.stringify(payload));
  } catch {
    // storage denied or full — progress is a convenience, never a requirement
  }
}
