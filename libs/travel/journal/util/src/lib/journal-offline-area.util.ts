import { MapArea, MapLayerKind, tilesToFree } from './journal-map-area.util';
import { TileJob } from './journal-tiles.util';

/** Download state of one area layer of one journal (design §4); `empty` tiles are known blanks and count as done. */
export interface OfflineLayerStatus {
  state: 'none' | 'loading' | 'ready' | 'partial';
  total: number; done: number; failed: number; empty: number; tiles: number; bytes: number; added: number; at: string;
}

export const NO_OFFLINE_LAYER: OfflineLayerStatus = { state: 'none', total: 0, done: 0, failed: 0, empty: 0, tiles: 0, bytes: 0, added: 0, at: '' };

export function offlineAreaKey(journalKey: string, areaId: string, kind: MapLayerKind): string {
  return `offlineArea:${journalKey}:${areaId}:${kind}`;
}

const STATES = ['none', 'loading', 'ready', 'partial'];

export function parseOfflineLayer(raw: string | undefined): OfflineLayerStatus {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<OfflineLayerStatus>) : undefined;
    if (value && typeof value === 'object' && STATES.includes(value.state as string)) {
      const out: OfflineLayerStatus = { ...NO_OFFLINE_LAYER };
      for (const k of ['total', 'done', 'failed', 'empty', 'tiles', 'bytes', 'added'] as const) {
        if (typeof value[k] === 'number' && Number.isFinite(value[k])) out[k] = value[k] as number;
      }
      out.state = value.state as OfflineLayerStatus['state'];
      if (typeof value.at === 'string') out.at = value.at;
      return out;
    }
  } catch {
    // a damaged entry counts as no download
  }
  return NO_OFFLINE_LAYER;
}

/** usable = ready, or partial with failed ≤ 10 % of total (today's rule). */
export function isUsable(s: OfflineLayerStatus): boolean {
  return s.state === 'ready' || (s.state === 'partial' && s.failed <= s.total * 0.1);
}

/** One-time migration of the old per-journal record: every area in its areaIds, each derived layer. */
export function migrateOfflineMap(
  old: { state: string; at: string; areaIds: string[]; total: number; failed: number },
  areas: MapArea[],
): Record<string, OfflineLayerStatus> {
  const out: Record<string, OfflineLayerStatus> = {};
  const state = old.state === 'ready' ? 'ready' : 'partial';
  for (const area of areas) {
    if (!old.areaIds.includes(area.id)) continue;
    for (const layer of area.layers) {
      out[`${area.id}:${layer.kind}`] = { ...NO_OFFLINE_LAYER, state, total: old.total, done: Math.max(0, old.total - old.failed), failed: old.failed, at: old.at };
    }
  }
  return out;
}

/**
 * Result of a finished run: ready when failed === 0 and done === total (empty markers count as done).
 * `tiles` = present files including empty markers (= `run.done`); `bytes` is the size on disk the caller measured
 * (native tileStats) when given, else the previous value stays.
 */
export function finishRun(
  prev: OfflineLayerStatus,
  run: { total: number; done: number; failed: number; empty: number; added: number; bytes?: number },
  at: string,
): OfflineLayerStatus {
  const ready = run.failed === 0 && run.done === run.total;
  const { bytes, ...counts } = run;
  return { ...prev, ...counts, state: ready ? 'ready' : 'partial', at, tiles: run.done, bytes: bytes ?? prev.bytes };
}

/** Paths of one journal's area layer that no other (journal, area, layer) plan still needs. */
export function layerTilesToFree(own: TileJob[], others: TileJob[]): string[] {
  return tilesToFree(own, others);
}
