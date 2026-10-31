import { DEFAULT_LUPE_SETTINGS, LupeSettings } from './lupe.model';

export const LUPE_STORAGE_KEY = 'okr.lupe.v1';

export function serializeLupe(settings: LupeSettings): string {
  return JSON.stringify({ zoom: settings.zoom, torch: settings.torch });
}

/** Restores stored settings; anything missing or invalid falls back to its default, field by field. */
export function restoreLupe(json: string | null): LupeSettings {
  if (!json) return { ...DEFAULT_LUPE_SETTINGS };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ...DEFAULT_LUPE_SETTINGS };
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const zoom = o['zoom'];
  return {
    zoom: typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_LUPE_SETTINGS.zoom,
    torch: typeof o['torch'] === 'boolean' ? o['torch'] : DEFAULT_LUPE_SETTINGS.torch,
  };
}
