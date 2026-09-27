import { ZipConfig } from './zip.model';

/** Smallest board offered by the size control. */
export const ZIP_MIN_SIZE = 3;
/** Largest board offered by the size control. */
export const ZIP_MAX_SIZE = 6;
/** Fewest checkpoints offered by the count control. */
export const ZIP_MIN_COUNT = 4;
/** Most checkpoints offered by the count control. */
export const ZIP_MAX_COUNT = 10;

/** The board sizes the size control offers, ascending. */
export const ZIP_SIZES: number[] = range(ZIP_MIN_SIZE, ZIP_MAX_SIZE);
/** The checkpoint counts the count control offers, ascending. */
export const ZIP_COUNTS: number[] = range(ZIP_MIN_COUNT, ZIP_MAX_COUNT);

/** What a freshly opened page plays: a 5x5 board with 6 checkpoints. */
export const ZIP_DEFAULT_CONFIG: ZipConfig = { size: 5, count: 6 };

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** Clamps `value` into `[min, max]`, falling back to `min` for anything non-finite. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Forces any incoming config into a generatable one: `size` into 3..6, `count` into 4..10 and
 * then down to at most `size * size`, because a board cannot carry more checkpoints than it has
 * cells. A 3x3 board therefore tops out at 9 checkpoints even though the control offers 10.
 */
export function clampZipConfig(config: ZipConfig): ZipConfig {
  const size = clamp(config.size, ZIP_MIN_SIZE, ZIP_MAX_SIZE);
  const count = Math.min(clamp(config.count, ZIP_MIN_COUNT, ZIP_MAX_COUNT), size * size);
  return { size, count };
}

/** True when `config` is already generatable, i.e. `clampZipConfig` would not change it. */
export function isValidZipConfig(config: ZipConfig): boolean {
  const clamped = clampZipConfig(config);
  return clamped.size === config.size && clamped.count === config.count;
}

/** The checkpoint counts that are actually selectable for a given board size. */
export function availableCounts(size: number): number[] {
  return ZIP_COUNTS.filter(count => count <= size * size);
}
