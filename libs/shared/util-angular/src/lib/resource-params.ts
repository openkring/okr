import { computed, Signal } from '@angular/core';

import { deepEqual } from '@okr/shared-util-core';

/**
 * Stabile `params` für `resource()` / `rxResource()`.
 *
 * `resource({ params })` vergleicht die Parameter NICHT nach Wert: intern liegt ein
 * `linkedSignal({ source: params })`, dessen Berechnung bei jeder Änderung einer im `params`-
 * Callback gelesenen Signalquelle neu läuft und ein neues Request-Objekt erzeugt — auch wenn
 * der berechnete Schlüssel identisch bleibt. Ein `params: () => currentUser()?.okey` startet die
 * Ressource also bei JEDER neuen `currentUser`-Referenz neu (Firestore liefert das Benutzer-
 * dokument zweimal: Cache, dann Server), obwohl der `okey` gleich ist. Gemessen am Dashboard
 * (2026-09-08): das Hauptmenü mit 197 Knoten wurde deshalb einmal komplett abgebaut und neu
 * aufgebaut — der grösste Einzelposten der Total Blocking Time.
 *
 * Diese Hülle ist ein `computed` mit Wertvergleich (`deepEqual`): erst ein tatsächlich anderer
 * Schlüssel erreicht die Ressource. Einsatz: `params: resourceParams(() => ({ userKey, tenantId }))`.
 * Schlüssel sollen Identitäten sein (`okey`, `personKey`, `uid`, Ids), keine Modellobjekte.
 */
export function resourceParams<T>(fn: () => T): Signal<T> {
  return computed(fn, { equal: deepEqual });
}
