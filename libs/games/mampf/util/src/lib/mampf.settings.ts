/** What Mampf remembers per browser. `dpad: null` = not chosen yet (default by pointer type). */
export interface MampfSettings {
  highScore: number;
  muted: boolean;
  dpad: boolean | null;
}

export const MAMPF_SETTINGS_KEY = 'okr.games.mampf';
export const DEFAULT_MAMPF_SETTINGS: MampfSettings = { highScore: 0, muted: false, dpad: null };

/** Reads the stored JSON defensively: bad JSON or a wrong field type falls back per field. */
export function parseMampfSettings(raw: string | null): MampfSettings {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null');
    if (parsed && typeof parsed === 'object') saved = parsed as Record<string, unknown>;
  } catch {
    // unreadable: every field falls back
  }
  const hs = saved['highScore'];
  return {
    highScore: typeof hs === 'number' && Number.isFinite(hs) && hs >= 0 ? Math.floor(hs) : 0,
    muted: typeof saved['muted'] === 'boolean' ? saved['muted'] : false,
    dpad: typeof saved['dpad'] === 'boolean' ? saved['dpad'] : null,
  };
}
