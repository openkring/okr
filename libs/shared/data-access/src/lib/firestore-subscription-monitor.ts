/** Art des Listeners: eine Collection-Query oder ein einzelnes Dokument. */
export type SubscriptionKind = 'query' | 'doc';

export interface SubscriptionCensusRow {
  collection: string;
  doc: number;
  query: number;
  total: number;
}

/**
 * Zähler je Cache-Schlüssel — das eigentliche Instrument.
 *
 * Die drei Werte werden an drei verschiedenen Stellen derselben Pipe erhoben und beantworten
 * gemeinsam die Frage, warum ein Stream mehrfach liefert:
 *
 * | Zähler           | Messpunkt              | Bedeutung |
 * |------------------|------------------------|-----------|
 * | `sourceEmissions`| VOR `share(...)`       | echte Firestore-Snapshots |
 * | `delivered`      | NACH `share(...)`      | an Konsumenten gelieferte Werte, Replays eingeschlossen |
 * | `subscribes`     | `defer(...)`-Wrapper   | wie oft überhaupt abonniert wurde |
 *
 * Lesart: `sourceEmissions = 3` heisst, Firestore emittiert wirklich dreimal (Cache-dann-Server
 * oder ein Write auf eine beobachtete Collection). `sourceEmissions = 1` bei `delivered = 3` und
 * `subscribes = 3` heisst, der ReplaySubject spielt denselben Wert an drei Abonnenten aus — dann
 * ist die Frage nicht «warum emittiert Firestore mehrfach», sondern «wer abonniert dreimal».
 */
export interface SubscriptionStatsRow {
  kind: SubscriptionKind;
  collection: string;
  key: string;
  subscribes: number;
  sourceEmissions: number;
  delivered: number;
  open: boolean;
}

interface StatsEntry {
  kind: SubscriptionKind;
  collection: string;
  subscribes: number;
  sourceEmissions: number;
  delivered: number;
}

/**
 * Zählt die offenen Firestore-Listener nach Collection und protokolliert je Cache-Schlüssel
 * Abonnements, Quell-Emissionen und Auslieferungen.
 *
 * Hintergrund: FirestoreService legt je Cache-Schlüssel genau einen Listener an und hält ihn
 * nach dem letzten Abmelden noch 30 s offen. Ein Seitenaufruf des Dashboards öffnete am
 * 2026-08-28 siebzig davon. Offen blieb, warum einzelne Streams (namentlich `pages`) pro
 * Seitenaufruf dreimal liefern — genau dafür sind die Zähler da.
 *
 * Reines Diagnosewerkzeug: keine Fehler, keine Seiteneffekte auf den Datenfluss.
 */
export class FirestoreSubscriptionMonitor {
  private readonly active = new Map<string, { kind: SubscriptionKind; collection: string }>();

  /**
   * Zähler je Cache-Schlüssel. Bewusst NICHT beim Schliessen entfernt: die Zähler eines
   * abgelaufenen Listeners sind der interessanteste Teil des Protokolls, und ein Schlüssel
   * kann nach dem 30-s-Fenster erneut geöffnet werden — die Zahlen laufen dann weiter.
   */
  private readonly stats = new Map<string, StatsEntry>();

  public opened(kind: SubscriptionKind, collection: string, key: string): void {
    registerConsoleAccess();
    if (!this.stats.has(key)) {
      this.stats.set(key, { kind, collection, subscribes: 0, sourceEmissions: 0, delivered: 0 });
    }
    if (this.active.has(key)) return;
    this.active.set(key, { kind, collection });
  }

  public closed(key: string): void {
    this.active.delete(key);
  }

  /** Ein Konsument hat den geteilten Stream abonniert (aus dem `defer(...)`-Wrapper). */
  public subscribed(key: string): void {
    const entry = this.stats.get(key);
    if (entry) entry.subscribes++;
  }

  /** Ein echter Firestore-Snapshot ist eingetroffen (Messpunkt VOR `share`). */
  public sourceEmitted(key: string): void {
    const entry = this.stats.get(key);
    if (entry) entry.sourceEmissions++;
  }

  /** Ein Wert wurde an einen Konsumenten geliefert, Replay eingeschlossen (Messpunkt NACH `share`). */
  public deliveredValue(key: string): void {
    const entry = this.stats.get(key);
    if (entry) entry.delivered++;
  }

  public activeCount(): number {
    return this.active.size;
  }

  /** Bestand nach Collection, absteigend nach Gesamtzahl; bei Gleichstand alphabetisch. */
  public census(): SubscriptionCensusRow[] {
    const byCollection = new Map<string, SubscriptionCensusRow>();
    for (const { kind, collection } of this.active.values()) {
      const row = byCollection.get(collection)
        ?? { collection, doc: 0, query: 0, total: 0 };
      row[kind]++;
      row.total++;
      byCollection.set(collection, row);
    }
    return [...byCollection.values()].sort(
      (a, b) => b.total - a.total || a.collection.localeCompare(b.collection)
    );
  }

  /**
   * Zähler je Cache-Schlüssel, absteigend nach Auslieferungen — die auffälligen Streams stehen
   * oben. Der Schlüssel ist bei Queries der serialisierte Query (Collection, Filter, Sortierung),
   * bei Dokumenten der Pfad; beides wird gekürzt, damit die Konsolentabelle lesbar bleibt.
   */
  public stream(): SubscriptionStatsRow[] {
    return [...this.stats.entries()]
      .map(([key, entry]) => ({
        kind: entry.kind,
        collection: entry.collection,
        key: key.length > 120 ? `${key.slice(0, 117)}...` : key,
        subscribes: entry.subscribes,
        sourceEmissions: entry.sourceEmissions,
        delivered: entry.delivered,
        open: this.active.has(key),
      }))
      .sort((a, b) => b.delivered - a.delivered || a.collection.localeCompare(b.collection));
  }

  public reset(): void {
    this.active.clear();
    this.stats.clear();
  }
}

/** Prozessweite Instanz — der FirestoreService meldet hier an und ab. */
export const firestoreSubscriptionMonitor = new FirestoreSubscriptionMonitor();

/**
 * Hängt die Diagnosefunktionen ans `window`: `__okrFirestoreCensus()` (Bestand + Zähler),
 * `__okrFirestoreStreams()` (Zählertabelle direkt gedruckt) und `__okrFirestoreReset()`.
 *
 * WARUM AUS EINER METHODE HERAUS UND NICHT AUF MODULEBENE: `libs/shared/data-access/package.json`
 * deklariert `"sideEffects": false`. Damit darf der Bundler Seiteneffekte auf Modulebene ersatzlos
 * streichen — und genau das ist am 2026-08-28 passiert: der Zähler war in v7.19.3 und v7.19.4
 * enthalten, `__okrFirestoreCensus` im Produktionsbuild aber nicht vorhanden. Von `opened()` aus
 * aufgerufen hängt die Registrierung an einem tatsächlich benutzten Export und überlebt das
 * Tree-Shaking. `sideEffects: false` bleibt bestehen; es ist für den Rest der Bibliothek richtig.
 *
 * Bewusst auch im Produktionsbuild vorhanden — die Messungen dieses Plans laufen gegen
 * Produktionsbuilds, und ein Dev-only-Zugang wäre dort nicht abrufbar. Der Monitor liest nur seine
 * eigenen Zähler; er legt keine Daten offen.
 */
export function registerConsoleAccess(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  // Die Registrierung selbst ist die Merkvariable — kein zusätzliches Modulflag. Ein Flag wäre
  // verstecktes Modulzustand, den Tests nicht zurücksetzen können, und es brächte nichts: der
  // Property-Zugriff je `opened()` ist gemessen bedeutungslos.
  if (typeof w['__okrFirestoreCensus'] === 'function') return;
  w['__okrFirestoreCensus'] = () => ({
    active: firestoreSubscriptionMonitor.activeCount(),
    byCollection: firestoreSubscriptionMonitor.census(),
    byStream: firestoreSubscriptionMonitor.stream(),
  });
  w['__okrFirestoreStreams'] = () => console.table(firestoreSubscriptionMonitor.stream());
  w['__okrFirestoreReset'] = () => firestoreSubscriptionMonitor.reset();

  // Eine Zeile, damit das Protokoll selbst belegt, dass das Instrument geladen ist — ohne sie war
  // nicht unterscheidbar, ob der Zähler fehlt oder nur nicht abgefragt wurde.
  console.info('[okr] Firestore-Diagnose bereit: __okrFirestoreCensus() · __okrFirestoreStreams() · __okrFirestoreReset()');
}
