# Alias — Kurzlinks, QR-Codes und generische Auflösung

**Spec:** [`planning/specs/2026-08-22-alias-service-spec.md`](../../../../../../planning/specs/2026-08-22-alias-service-spec.md) · TOC **3.21**

## Overview

Der Kern ist `(space, alias) → target`. Der HTTP-Redirect ist **ein Konsument, nicht der Kern**:
das Diary löst über denselben Mechanismus `'Barbara' → person.<okey>` auf, in-app, ohne HTTP und
ohne Klick.

Ein **`AliasSpace`** ist Konfiguration *und* Namensraum — keine Kampagne. Länge, Zeichensatz,
Tracking, Aufbewahrung und `roleNeeded` gehören dem Space; Plakat und Newsletter unterscheiden
sich über die **Notiz** eines Alias, nicht über einen eigenen Space. Wäre jede Kampagne ein
eigener Space, würde die Space-Liste zur zweiten Alias-Liste und die URL genau dort länger, wo
sie kurz sein muss.

## Firestore Collections

| Collection | Document-ID | Geschrieben von | Gelesen von |
|---|---|---|---|
| `aliases` | `<tenant>__<space>__<aliasLower>` | **nur Cloud Functions** (`createAlias`/`resolveAlias`) | Client + Resolver |
| `aliasSpaces` | autoId | Admin über die App | Client |
| `aliasStats` | `<aliasKey>__<yyyy-mm-dd>` | Resolver (Teilprojekt 4) | Detailseite |
| `aliasEvents` | autoId | Resolver bei `trackingLevel: 'detailed'` (TP4) | privileged |

**`aliases` ist `allow write: if false`, und der Grund ist nicht die Rolle.** Die Document-ID ist
deterministisch; `FirestoreService.createModel()` schreibt mit `setDoc()` und würde einen
bestehenden — womöglich **gedruckten** — Alias still überschreiben statt zu kollidieren. Nur
`.create()` des Admin SDK wirft. Deshalb prägt ausschliesslich der Server, und `AliasService` ist
für `aliases` lesend.

## Feldsemantik (Auszug)

| Feld | Bedeutung |
|---|---|
| `space` | Name des `AliasSpace`, **nicht** dessen okey — er steht in URL und Document-ID |
| `alias` | der Code in Anzeigeschreibweise; normalisiert in der ID |
| `targetType` | `url` (https) · `model` (`targetKey`) · `none` (reiner Identifikator) |
| `targetKey` | `person.<okey>` — nur Modelltypen aus `ALIAS_TARGET_ROUTES` sind erlaubt |
| `original` | menschenlesbares Original; Schlüssel des Reverse-Lookup von `resolveAlias` |
| `isEnabled` | widerrufen statt löschen — ein gedruckter QR-Code verschwindet nie aus der Welt |
| `trackingLevel` | `inherit` (vom Space) · `off` · `counter` · `detailed` |

### Warum `ALIAS_TARGET_ROUTES` existiert

Ein Modellziel wird **beim Klick** in eine Route übersetzt, nicht beim Anlegen — genau das lässt
ein gedrucktes Plakat eine Routenumbenennung überleben. Die frühere Annahme war
`/{modelType}/{okey}`; die gilt aber nur für `person`. `calevent` hat
`:listId/:contextMenuName` (ein okey würde als `listId` binden und eine **leere Liste** rendern),
`trip` hat gar keine Detailroute. Ein 302 darauf wäre kein Fehler, sondern eine falsche Seite.
Deshalb steht in `@okr/system-alias-util` eine geprüfte Karte, und `createAlias` weist unroutbare
Ziele schon **beim Prägen** ab.

## Store

`AliasStore` (component-provided in beiden Listen) hält Suchbegriff und Space-Filter, streamt
`aliases` + `aliasSpaces`, und leitet daraus `spaceUsage` ab — Anzahl Aliase und Summe der
Aufrufe pro Space. Dieselbe Zahl entscheidet, ob das Space-Formular `name`, `kind`, `charset` und
`caseSensitive` sperrt: ein Space mit Aliasen darf nicht umbenannt werden.

`add()` geht über `AliasMintService` (Callable), **nicht** über Firestore. Fehlermeldungen des
Servers werden wörtlich gezeigt — sie sind dort neben der Regel formuliert, die sie ausgelöst hat.

## Components

| Datei | Route | Rolle |
|---|---|---|
| `alias-list.ts` | `/alias/:listId/:contextMenuName` | `privileged` |
| `alias-space-list.ts` | `/alias/spaces` | `admin` |
| `alias.page.ts` | `/alias/:aliasKey` | `privileged` |
| `alias.form.ts`, `alias-edit.modal.ts` | — | in `@okr/system-alias-ui` |
| `alias-space.form.ts`, `alias-space-edit.modal.ts` | — | in `@okr/system-alias-ui` |
| `alias-qr.ts` | — | QR-Vorschau + SVG-Download |

Die Reihenfolge der Route-Kinder ist **load-bearing**: `spaces` steht vor `:aliasKey`, sonst
schluckt der Parameter-Pfad das Wort.

Die Detailseite ist bewusst **read-only** und zeigt heute nur `useCount`/`lastUsedAt` mit einem
ehrlichen Leerzustand — die Tagesaggregate schreibt erst Teilprojekt 4.

## Konsumenten

| Space | Kind | `roleNeeded` | Wer prägt, wofür |
|---|---|---|---|
| `link` | redirect | `registered` | «Link zum Termin kopieren» im calevent-ActionSheet |
| `person`, `location` (bka) | lookup | `admin` | Diary-Auflösung `'Barbara' → person.<okey>` |

Der `link`-Space steht **allen registrierten Nutzern** offen, und das ist kein Aufweichen der
Regel, sondern eine Folge der Operation: die Termin-Aktion ruft `resolveAlias` mit
`original: 'calevent.<okey>'`. Der erste Aufruf prägt, jeder weitere bekommt denselben Code
zurück — die Alias-Liste wächst mit der Zahl der Termine, nicht mit der Zahl der Klicks. Mit
`createAlias` wäre dieselbe Freigabe ein Leck.

Weil die Rollen der App **gestuft** sind, prüft `assertMayMint` über `hasRole` und nicht über
ein flaches `roles[roleNeeded] === true`: ein `eventAdmin` ist auch `registered`, ohne das Flag
gesetzt haben zu müssen. Ein flacher Vergleich hätte den `link`-Space ausgerechnet den
Organisatoren verwehrt.

Ein neuer Space wird mit `scripts/seed-link-space.mjs --tenant=<id> [--write]` angelegt
(`--dry-run` ist der Default). Er braucht pro Tenant das `/s/**`-Rewrite in `firebase.json` —
heute haben das `scs`, `p13` und `kring`.

## Der HTTP-Resolver ist keine Angular-Route

`GET /s/:space/:code` läuft in `apps/functions/src/publicApi/routes/alias.ts` und antwortet mit
einem **302**, bevor die App lädt. Er braucht pro App-Site ein `/s/**`-Hosting-Rewrite in
`firebase.json` — ohne das verschluckt der SPA-Fallback jeden Kurzlink und liefert 200 mit leerer
App.

## Library Path

`libs/system/alias/{util,data-access,ui,feature}` → `@okr/system-alias-{util,data-access,ui,feature}`

`util` ist **Angular-frei** und wird von den Cloud Functions importiert. `alias-i18n.ts`
importiert `Signal` deshalb `import type` — ein Wert-Import würde `@angular/core` in den
Functions-Bundle ziehen.
