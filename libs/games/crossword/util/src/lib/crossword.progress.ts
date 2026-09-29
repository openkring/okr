import { CrosswordGrid } from '@okr/shared-models';

interface StoredProgress {
  rows: number;
  cols: number;
  /**
   * Cheap layout fingerprint (see `layoutFingerprint`). Absent on blobs saved by the old format —
   * that absence must itself count as a mismatch, never crash the read.
   */
  fp?: string;
  filled: [string, string][];
}

const storageKey = (okey: string): string => `okr.crossword.${okey}`;

/**
 * A cheap, order-sensitive fingerprint of the grid's layout — NOT just its bounding box.
 *
 * The generator's scorer optimises for compactness, so regenerating (or re-rolling) after an
 * entry edit very often keeps the same `rows`/`cols` while producing a different placement of
 * words. `rows`/`cols` alone can't tell the two layouts apart, so old letters would get mapped
 * onto a new grid — some landing on cells that are now blocked. Placement count plus the first
 * placement's identity is enough to catch that without serialising the whole grid.
 */
function layoutFingerprint(grid: CrosswordGrid): string {
  const first = grid.placements[0];
  const firstKey = first ? `${first.entry}:${first.row}:${first.col}:${first.direction}:${first.number}` : '';
  return `${grid.placements.length}|${firstKey}`;
}

/**
 * The letters this device has typed for a topic. Per browser, never in Firestore.
 *
 * Every read is defensive: a private window, cleared site data, a browser blocking storage, a
 * grid that was regenerated under a saved blob (same bounding box, different layout), or a blob
 * saved by an older format without a fingerprint must all start a clean puzzle rather than break
 * the page or silently misplace letters.
 */
export function loadProgress(okey: string, grid: CrosswordGrid): Map<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(okey));
    if (!raw) return new Map();
    const stored = JSON.parse(raw) as StoredProgress;
    if (stored.rows !== grid.rows || stored.cols !== grid.cols) return new Map();
    if (stored.fp !== layoutFingerprint(grid)) return new Map();
    return new Map(stored.filled);
  } catch {
    return new Map();
  }
}

export function saveProgress(okey: string, grid: CrosswordGrid, filled: Map<string, string>): void {
  try {
    const payload: StoredProgress = {
      rows: grid.rows,
      cols: grid.cols,
      fp: layoutFingerprint(grid),
      filled: [...filled.entries()],
    };
    localStorage.setItem(storageKey(okey), JSON.stringify(payload));
  } catch {
    // storage denied or full — progress is a convenience, never a requirement
  }
}
