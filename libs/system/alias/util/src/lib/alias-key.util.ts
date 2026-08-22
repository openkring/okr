import { AliasCharset, AliasSpaceModel } from '@okr/shared-models';

/**
 * Die Alphabete der generierten Codes.
 *
 * 'base32-safe' lässt 0/O/1/l/I bewusst weg: ein Code wird abgetippt, diktiert und aus einem
 * QR-Scan wieder vorgelesen — Verwechslungen kosten dort mehr als die vier fehlenden Zeichen.
 */
export const ALIAS_CHARSETS: Record<Exclude<AliasCharset, 'words'>, string> = {
  // Kleinbuchstaben ohne l und o, Ziffern ohne 0 und 1 — exakt 32 Zeichen. Weil das Alphabet
  // reine Kleinschreibung ist, können O und I gar nicht erst auftreten; es genügt, l/1 und o/0
  // zu entschärfen. 'i' bleibt eindeutig, sobald '1' fehlt.
  'base32-safe':   'abcdefghijkmnpqrstuvwxyz23456789',
  'base62':        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  'lower-numeric': 'abcdefghijklmnopqrstuvwxyz0123456789',
};

/** Der Alias in seiner Vergleichsform — die Case-Regel gehört dem Space. */
export function normalizeAlias(alias: string, caseSensitive: boolean): string {
  const trimmed = alias.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

/**
 * Die Document-ID eines Alias. Deterministisch, damit Auflösung ein einziges getDoc ist:
 * kein Query, kein Composite-Index, ein Netzwerk-Roundtrip vor jedem Redirect.
 */
export function buildAliasDocId(tenantId: string, space: string, alias: string, caseSensitive: boolean): string {
  return `${tenantId}__${space}__${normalizeAlias(alias, caseSensitive)}`;
}

/**
 * Einen neuen Code prägen. `random` ist injizierbar, damit der Test die Abbildung auf das
 * Alphabet prüfen kann, statt nur ihre Statistik.
 */
export function generateAliasCode(charset: AliasCharset, length: number, random: () => number = Math.random): string {
  if (charset === 'words') {
    throw new Error("generateAliasCode: charset 'words' has no word list yet");
  }
  const chars = ALIAS_CHARSETS[charset];
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(random() * chars.length)];
  }
  return code;
}

/**
 * Darf dieser Alias so in diesem Space existieren?
 *
 * Zwei Stufen: Ein Vanity-Handle darf ein freieres Alphabet benutzen, aber NIE ein Zeichen, das
 * die Route /s/:space/:code oder die Document-ID zerlegen würde.
 */
export function isValidAliasFormat(alias: string, space: AliasSpaceModel): boolean {
  const value = normalizeAlias(alias, space.caseSensitive);
  if (value.length === 0) return false;
  // '/' zerlegt die Route, '_' die Document-ID, Whitespace überlebt kein Copy-Paste.
  if (/[/\s_]/.test(value)) return false;
  if (space.allowCustom) return /^[a-z0-9-]+$/i.test(value);
  const chars = space.charset === 'words' ? '' : ALIAS_CHARSETS[space.charset];
  return [...value].every((c) => chars.includes(c));
}
