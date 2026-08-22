import { DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, TaggedModel } from './base.model';

/** Was ein Alias auflöst. 'none' = reiner Identifikator ohne Ziel (Buchungsreferenz, Bootsmarke). */
export type AliasTargetType = 'url' | 'model' | 'none';

/** Wie viel ein Zugriff hinterlässt. Siehe Spec, Abschnitt „Privacy". */
export type AliasTrackingLevel = 'off' | 'counter' | 'detailed';

/** Auf dem Alias zusätzlich erlaubt: die Vorgabe des Space übernehmen. */
export type AliasTrackingSetting = AliasTrackingLevel | 'inherit';

/**
 * Ein Alias: ein kurzer Schlüssel, der auf ein Ziel auflöst
 * (planning/specs/2026-08-22-alias-service-spec.md).
 *
 * Die Document-ID ist NICHT zufällig, sondern `<tenant>__<space>__<aliasLower>` — dadurch ist
 * Auflösung ein einziges getDoc ohne Query und ohne Index. Gebildet wird sie von
 * `buildAliasDocId()` in `@okr/system-alias-util`.
 *
 * ACHTUNG: Erzeugt werden Aliase ausschliesslich serverseitig (Callables `createAlias` /
 * `resolveAlias`). `FirestoreService.createModel()` benutzt setDoc() und würde einen bestehenden
 * Alias stillschweigend überschreiben; nur `.create()` des Admin SDK wirft bei Kollision.
 */
export class AliasModel implements OkrModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;   // 'Plakat Bootshaus', 'Newsletter März' — der Messpunkt

  public space = '';              // AliasSpaceModel.name, NICHT dessen okey (steht in URL + ID)
  public alias = '';              // der Code/das Handle in Anzeigeschreibweise
  public targetType: AliasTargetType = 'url';
  public targetUrl = '';          // '' ausser bei targetType === 'url'
  public targetKey = '';          // 'person.<okey>' | 'calevent.<okey>' | ''
  public original = '';           // menschenlesbares Original: Suche, Anzeige, Reverse-Lookup

  // Widerrufen statt löschen: ein gedruckter QR-Code verschwindet nie aus der Welt.
  public isEnabled = true;
  public validFrom = '';          // StoreDate, '' = sofort
  public validUntil = '';         // StoreDate, '' = nie
  public maxUses = 0;             // 0 = unbegrenzt
  public useCount = 0;
  public lastUsedAt = '';         // StoreDateTime

  public trackingLevel: AliasTrackingSetting = 'inherit';
  public retentionDays = 0;       // 0 = vom Space erben

  public createdBy = '';          // 'person.<okey>'
  public createdAt = '';          // StoreDateTime

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AliasCollection = 'aliases';
export const AliasModelName = 'alias';
