/** Art des Listeners: eine Collection-Query oder ein einzelnes Dokument. */
export type SubscriptionKind = 'query' | 'doc';

export interface SubscriptionCensusRow {
  collection: string;
  doc: number;
  query: number;
  total: number;
}

/**
 * Zählt die offenen Firestore-Listener nach Collection.
 *
 * Hintergrund: FirestoreService legt je Cache-Schlüssel genau einen Listener an und hält ihn
 * nach dem letzten Abmelden noch 30 s offen. Ein Seitenaufruf des Dashboards öffnete am
 * 2026-08-28 siebzig davon — die mutmassliche Ursache der 12 s Garbage Collection. Dieser
 * Monitor beantwortet die Frage, die die Spezifikation offenlässt: welche Collection sie
 * erzeugt.
 *
 * Reines Diagnosewerkzeug: keine Fehler, keine Seiteneffekte auf den Datenfluss.
 */
export class FirestoreSubscriptionMonitor {
  private readonly active = new Map<string, { kind: SubscriptionKind; collection: string }>();

  public opened(kind: SubscriptionKind, collection: string, key: string): void {
    if (this.active.has(key)) return;
    this.active.set(key, { kind, collection });
  }

  public closed(key: string): void {
    this.active.delete(key);
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

  public reset(): void {
    this.active.clear();
  }
}

/** Prozessweite Instanz — der FirestoreService meldet hier an und ab. */
export const firestoreSubscriptionMonitor = new FirestoreSubscriptionMonitor();

// Diagnosezugang aus der Browser-Konsole: `__okrFirestoreCensus()`.
// Bewusst auch im Produktionsbuild vorhanden — die Messungen dieses Plans laufen gegen
// Produktionsbuilds, und ein Dev-only-Zugang wäre dort nicht abrufbar. Der Monitor liest
// nur seine eigene Map; er legt keine Daten offen.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__okrFirestoreCensus'] = () => ({
    active: firestoreSubscriptionMonitor.activeCount(),
    byCollection: firestoreSubscriptionMonitor.census(),
  });
}
