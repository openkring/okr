/**
 * Externe Kennungen einer Person (`PersonModel.externalIds`, spec 1.132 §5.4): die J+S-Personennummer
 * und kuenftige Fremdsystem-Kennungen. Feste Schluessel aus `EXTERNAL_ID_KINDS`; ein neues System ist
 * eine Zeile hier, keine Schema-Aenderung. Nie fuer heikle Kennungen (AHV bleibt im `addresses`-Tresor).
 */
export type ExternalIdKind = {
  kind: string; // Systemname, der Teil vor dem '_' im Schluessel ('js', 'bexio')
  pattern: RegExp; // Pruefung des Werts
  scoped: boolean; // true = die Kennung gehoert zu einem Fremdsystem-Konto, Schluessel '<kind>_<scope>'
};

export const EXTERNAL_ID_KINDS: readonly ExternalIdKind[] = [
  { kind: 'js', pattern: /^\d{9}$/, scoped: false }, // J+S-Personennummer: genau 9 Ziffern, gehoert zur Person
  { kind: 'bexio', pattern: /^\d+$/, scoped: true }, // bexio-ID: gilt nur fuer eine bexio-Firma → 'bexio_<accountingTenantId>'
];

/** 'js' → 'js'; 'bexio' + 'gss' → 'bexio_gss'. */
export function externalIdKey(kind: string, scope?: string): string {
  return scope ? `${kind}_${scope}` : kind;
}

/**
 * Prueft einen Wert gegen die Regel seines Schluessels. Ein unbekannter Schluessel ist nie gueltig,
 * ebenso ein Schluessel ohne Geltungsbereich bei einer scoped Art (und umgekehrt).
 * Die Art eines Schluessels ist der Teil vor dem ersten '_'.
 */
export function isValidExternalId(key: string, value: string): boolean {
  const sep = key.indexOf('_');
  const kind = sep < 0 ? key : key.slice(0, sep);
  const scope = sep < 0 ? '' : key.slice(sep + 1);
  const def = EXTERNAL_ID_KINDS.find((k) => k.kind === kind);
  if (!def) return false;
  if (def.scoped !== (scope !== '')) return false;
  return def.pattern.test(value);
}

/** Liest eine externe Kennung; '' wenn die Person das Feld oder den Schluessel nicht hat (Legacy). */
export function getExternalId(person: { externalIds?: Record<string, string> } | undefined, key: string): string {
  return person?.externalIds?.[key] ?? '';
}
