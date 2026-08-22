import { AliasModel, AliasSpaceModel, AliasTrackingLevel } from '@okr/shared-models';

import { buildModelTargetUrl } from './alias-target-routes';

/** Warum ein Alias gerade nicht benutzbar ist — der Resolver bildet das auf 302/404/410 ab. */
export type AliasUsability = 'ok' | 'disabled' | 'archived' | 'notYetValid' | 'expired' | 'exhausted';

/**
 * Kann dieser Alias jetzt benutzt werden?
 *
 * Die Reihenfolge ist bewusst: operative Ursachen (widerrufen, archiviert) vor zeitlichen. Wer
 * einen Link gesperrt hat, will „gesperrt" lesen und nicht „abgelaufen".
 * @param today Vergleichsdatum als StoreDate (yyyyMMdd) — injiziert, damit der Test nicht von der
 *              Systemuhr abhängt.
 */
export function getAliasUsability(alias: AliasModel, today: string): AliasUsability {
  if (!alias.isEnabled) return 'disabled';
  if (alias.isArchived) return 'archived';
  if (alias.validFrom !== '' && today < alias.validFrom) return 'notYetValid';
  if (alias.validUntil !== '' && today > alias.validUntil) return 'expired';   // inklusiv
  if (alias.maxUses > 0 && alias.useCount >= alias.maxUses) return 'exhausted';
  return 'ok';
}

/**
 * Darf diese URL Ziel eines öffentlichen Redirects sein?
 *
 * Nur https. Ein öffentlicher Redirector, der 'javascript:' oder 'data:' weiterreicht, ist ein
 * Waschgang für fremde Payloads; 'http:' würde eine TLS-Verbindung stillschweigend downgraden.
 */
export function isSafeTargetUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Die Ziel-URL — für Model-Ziele ERST JETZT gebaut, nicht beim Anlegen. Genau das lässt ein
 * gedrucktes Plakat eine Routenumbenennung überleben.
 *
 * Model-Ziele laufen über `ALIAS_TARGET_ROUTES` (siehe `alias-target-routes.ts`): ein nicht
 * kartierter Modelltyp liefert '' und damit einen 404 im Resolver. Das ist Absicht — die frühere
 * `/{modelType}/{okey}`-Annahme galt nur für `person` und hätte für `calevent`/`trip` einen 302
 * auf eine falsche Seite erzeugt statt eines ehrlichen Fehlers.
 * @param appBaseUrl Origin der Tenant-App, ohne Slash am Ende.
 */
export function buildTargetUrl(alias: AliasModel, appBaseUrl: string): string {
  if (alias.targetType === 'url') return alias.targetUrl;
  if (alias.targetType === 'none') return '';
  return buildModelTargetUrl(alias, appBaseUrl);
}

/** Der Space liefert die Vorgabe, der Alias darf sie überschreiben. 'inherit'/0 heisst erben. */
export function getEffectiveTracking(
  alias: AliasModel,
  space: AliasSpaceModel,
): { level: AliasTrackingLevel; retentionDays: number } {
  return {
    level: alias.trackingLevel === 'inherit' ? space.trackingLevel : alias.trackingLevel,
    retentionDays: alias.retentionDays > 0 ? alias.retentionDays : space.retentionDays,
  };
}
