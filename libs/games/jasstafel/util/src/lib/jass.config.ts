import { CoiffeurRow, JassConfig } from './jass.types';

export const DEFAULT_COIFFEUR_ROWS: CoiffeurRow[] = [
  { id: 'eicheln', label: 'Eicheln', multiplier: 1 },
  { id: 'schellen', label: 'Schellen', multiplier: 2 },
  { id: 'schilten', label: 'Schilten', multiplier: 3 },
  { id: 'rosen', label: 'Rosen', multiplier: 4 },
  { id: 'obenabe', label: 'Obenabe', multiplier: 5 },
  { id: 'undenufe', label: 'Undenufe', multiplier: 6 },
  { id: 'slalom', label: 'Slalom', multiplier: 7 },
  { id: 'guschti', label: 'Guschti', multiplier: 8 },
  { id: 'misere', label: 'Misère', multiplier: 9 },
  { id: 'wunsch', label: 'Wunsch', multiplier: 10 },
];

export const DEFAULT_JASS_CONFIG: JassConfig = {
  schieberTarget: 1000,
  bueterPairTarget: 1000,
  bueterBid: 650,
  coiffeurRows: DEFAULT_COIFFEUR_ROWS,
  differenzlerHands: 12,
};

const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

function normalizeRows(raw: unknown): CoiffeurRow[] {
  if (!Array.isArray(raw)) return DEFAULT_COIFFEUR_ROWS;
  const rows = raw.filter((r): r is CoiffeurRow =>
    !!r && typeof r.id === 'string' && r.id.length > 0 &&
    typeof r.label === 'string' && r.label.trim().length > 0 && isPosInt(r.multiplier));
  if (rows.length === 0) return DEFAULT_COIFFEUR_ROWS;
  return [...rows].sort((a, b) => a.multiplier - b.multiplier);
}

/**
 * Repairs whatever `localStorage` hands back: an older shape, a hand edit or plain garbage must
 * never stop the page from opening. Each field falls back to its default on its own.
 */
export function normalizeConfig(raw: unknown): JassConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof JassConfig, unknown>>;
  const d = DEFAULT_JASS_CONFIG;
  return {
    schieberTarget: isPosInt(r.schieberTarget) ? r.schieberTarget : d.schieberTarget,
    bueterPairTarget: isPosInt(r.bueterPairTarget) ? r.bueterPairTarget : d.bueterPairTarget,
    bueterBid: isPosInt(r.bueterBid) ? r.bueterBid : d.bueterBid,
    coiffeurRows: normalizeRows(r.coiffeurRows),
    differenzlerHands: isPosInt(r.differenzlerHands) ? r.differenzlerHands : d.differenzlerHands,
  };
}
