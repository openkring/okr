import type { Timestamp } from 'firebase/firestore';

import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/**
 * Tagesaggregat der Zugriffe auf einen Alias (`trackingLevel: 'counter'`).
 *
 * Document-ID: `<aliasKey>__<yyyy-mm-dd>` — deterministisch, damit der Resolver mit einem
 * einzigen `set(..., { merge: true })` und `FieldValue.increment` hochzählen kann, ohne vorher
 * zu lesen.
 *
 * **Bewusst OHNE IP und OHNE uid.** Das ist keine Auslassung, sondern der Grund, warum
 * `counter` der empfohlene Default ist: die Frage „wirkt das Plakat" lässt sich beantworten,
 * ohne einen Bestand an Personendaten anzulegen. Wer eine Zeile pro Klick braucht, schaltet
 * bewusst `detailed` ein und bekommt `AliasEventModel` — mit zwingender Aufbewahrungsfrist.
 *
 * `byReferrer`/`byDevice`/`byCountry` sind grobe Klassen (Referrer-HOST, nicht die volle URL;
 * 'mobile'/'desktop'; Ländercode), keine Merkmale, aus denen sich eine Person rekonstruieren
 * liesse.
 */
export class AliasStatsModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;

  public aliasKey = '';           // die Document-ID des Alias
  public space = '';
  public date = '';               // yyyy-MM-dd — Kalendertag, nicht StoreDate
  public count = 0;

  public byReferrer: Record<string, number> = {};
  public byDevice: Record<string, number> = {};
  public byCountry: Record<string, number> = {};

  /**
   * ACHTUNG — echter Firestore-`Timestamp`, NICHT die sonst übliche StoreDate-Zeichenkette.
   * Die native TTL-Policy von Firestore akzeptiert ausschliesslich ein Timestamp-Feld; eine
   * Zeichenkette würde stillschweigend nie ablaufen. Deshalb bricht dieses eine Feld mit der
   * Datumskonvention des Repos, und zwar absichtlich.
   */
  public expiresAt?: Timestamp;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const AliasStatsCollection = 'aliasStats';
export const AliasStatsModelName = 'aliasStats';
