import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel } from './base.model';
import { RoleName } from './menu-item.model';
import { AliasTargetType, AliasTrackingLevel } from './alias.model';

/** Wer den Alias auflöst: HTTP-Redirect (serverseitig) oder die App selbst (clientseitig). */
export type AliasSpaceKind = 'redirect' | 'lookup';

/**
 * Das Alphabet der generierten Codes. 'base32-safe' lässt 0/O/1/l/I weg — für QR und
 * abgetippte Codes zählt das Alphabet mehr als die Länge.
 * 'words' ist im Modell vorgesehen, aber noch ohne Wortliste (Spec, offene Punkte).
 */
export type AliasCharset = 'base32-safe' | 'base62' | 'lower-numeric' | 'words';

/**
 * Ein Alias-Space: Konfiguration UND Namensraum
 * (planning/specs/2026-08-22-alias-service-spec.md).
 *
 * Ein Space ist langlebig ('qr', 'mail', 'link', 'doc', 'diary-person') — er ist KEINE Kampagne.
 * Ein einzelnes Plakat oder ein einzelner Newsletter unterscheidet sich über AliasModel.notes,
 * nicht über einen eigenen Space; sonst dupliziert sich die Konfiguration und die URL wird genau
 * dort länger, wo sie kurz sein muss.
 *
 * `name` steht in der URL (/s/<name>/<code>) und in der Document-ID jedes Alias und ist deshalb
 * nach der ersten Alias-Vergabe UNVERÄNDERLICH. `label` ist die frei änderbare Anzeige.
 */
export class AliasSpaceModel implements OkrModel, NamedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public notes = DEFAULT_NOTES;

  public name = DEFAULT_NAME;     // URL-Segment, unveränderlich sobald Aliase existieren
  public label = '';              // i18n-Key für die UI
  public kind: AliasSpaceKind = 'redirect';

  public length = 6;              // 6 × base32-safe ≈ 1e9 Kombinationen
  public charset: AliasCharset = 'base32-safe';
  public allowCustom = false;     // Vanity-Handles ('gv2026')
  public caseSensitive = false;   // lookup-Spaces wollen 'barbara' === 'Barbara'
  public targetTypes: AliasTargetType[] = ['url'];

  public defaultValidDays = 0;    // 0 = nie ablaufend
  public defaultMaxUses = 0;      // 0 = unbegrenzt

  public trackingLevel: AliasTrackingLevel = 'counter';
  public retentionDays = 365;
  public roleNeeded: RoleName = 'privileged';   // wer in diesem Space prägen darf

  public isEnabled = true;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AliasSpaceCollection = 'aliasSpaces';
export const AliasSpaceModelName = 'aliasSpace';
