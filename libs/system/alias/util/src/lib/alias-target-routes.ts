import { AliasModel } from '@okr/shared-models';

/**
 * Modelltyp → erstes Pfadsegment seiner Detailroute.
 *
 * KEINE Konvention, sondern eine geprüfte Liste. `person.<okey>` → `/person/<okey>` funktioniert,
 * weil `person` ein `:personKey`-Child hat; `templates/:templateKey` steht dagegen unter dem
 * PLURAL-Pfad, und `calevent`/`trip` haben überhaupt keine Detailroute (nur
 * `:listId/:contextMenuName`, an das ein okey als `listId` binden und eine leere Liste rendern
 * würde — ein falscher 302 statt eines ehrlichen 404).
 *
 * Quelle: `libs/tenant/routes/src/lib/feature-catalogue.ts`. Diese Lib darf ihn nicht importieren
 * (Angular in einer Angular-freien Lib, die die Cloud Functions laden), deshalb prüft
 * `alias-target-routes.spec.ts` die Karte gegen den Quelltext des Katalogs.
 *
 * Ein Eintrag hier heisst NICHT, dass jeder Nutzer die Route auch betreten darf — die Guards des
 * Katalogs bleiben zuständig. Ein 302 auf eine geschützte Route landet auf dem Login, und das ist
 * der richtige Ausgang.
 */
export const ALIAS_TARGET_ROUTES: Readonly<Record<string, string>> = {
  person: 'person',
  group: 'group',
  user: 'user',
  whiteboard: 'whiteboard',
};

/** `'person.abc'` → `{ modelType: 'person', okey: 'abc' }`; alles andere → undefined. */
export function splitTargetKey(targetKey: string): { modelType: string; okey: string } | undefined {
  const parts = targetKey.split('.');
  if (parts.length !== 2) return undefined;
  const [modelType, okey] = parts;
  if (!modelType || !okey) return undefined;
  return { modelType, okey };
}

/**
 * Kann die App aus diesem targetKey überhaupt eine Detailseite bauen?
 *
 * Das ist ein SCHREIB-Gate, nicht nur ein Lese-Gate: `createAlias` weist ein unroutbares
 * Modellziel ab, damit ein gedruckter Code gar nicht erst entstehen kann, der später ins Leere
 * zeigt.
 */
export function isRoutableTargetKey(targetKey: string): boolean {
  const parts = splitTargetKey(targetKey);
  return parts !== undefined && parts.modelType in ALIAS_TARGET_ROUTES;
}

/** Die Detail-URL eines Modellziels, oder '' wenn dieser Modelltyp keine Detailroute hat. */
export function buildModelTargetUrl(alias: AliasModel, appBaseUrl: string): string {
  const parts = splitTargetKey(alias.targetKey);
  if (!parts) return '';
  const segment = ALIAS_TARGET_ROUTES[parts.modelType];
  if (!segment) return '';
  return `${appBaseUrl}/${segment}/${parts.okey}`;
}
