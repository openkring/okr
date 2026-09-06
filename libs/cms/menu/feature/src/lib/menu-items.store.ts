import { computed, effect, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, from, of, timeout } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { MenuItemModel } from '@okr/shared-models';
import { debugData } from '@okr/shared-util-core';

import { MenuService } from '@okr/cms-menu-data-access';

/**
 * Die Menüliste des Mandanten — EIN Abonnement für die ganze Anwendung.
 *
 * Warum das eine eigene, root-bereitgestellte Klasse ist: `MenuStore` wird von `Menu`
 * (`menu.ts`) als `providers: [MenuStore]` deklariert, also je Komponente neu erzeugt — und das
 * zu Recht, denn `MenuState.name` ist Zustand genau dieses Menüknotens. `Menu` rendert sich aber
 * rekursiv, sodass ein Menübaum entsprechend viele Stores erzeugt. Solange die Liste ALLER
 * Menüeinträge in diesem Store lag, abonnierte jeder Knoten dieselbe mandantenweite Abfrage
 * erneut: am 2026-08-29 auf dem Dashboard **170 Abonnements**, die bei zwei Firestore-Snapshots
 * (Cache, dann Server) **340 Auslieferungen** ergaben — gemessen mit `__okrFirestoreStreams()`.
 *
 * Firestore kostet das nichts (der FirestoreService teilt einen Listener je Abfrage, weshalb
 * jede netzseitige Messung daran vorbeisah); es kostet JavaScript: 170 Abonnentenketten und 340
 * Array-Emissionen je Seitenaufruf, jeweils mit dem daran hängenden Signalgraphen.
 *
 * Aufteilung: die geteilte Liste hier, der knotenspezifische Zustand (`name`, `toggleActive`,
 * `searchTerm`, `selectedCategory`) bleibt im `MenuStore` je Komponente.
 */
@Injectable({ providedIn: 'root' })
export class MenuItemsStore {
  private readonly menuService = inject(MenuService);
  private readonly appStore = inject(AppStore);

  /**
   * Wie lange der Live-Listener Zeit bekommt, seinen ERSTEN Snapshot zu liefern.
   *
   * Ein Firestore-Listener, der weder emittiert noch scheitert, hielt den Spinner des
   * Hauptmenüs unbegrenzt (`isLoading()` bleibt wahr, bis der Strom etwas liefert). Genau das
   * passiert auf Apple-Geräten am leichtesten: Safari, iOS und Firefox laufen auf
   * `memoryLocalCache` (siehe `@okr/shared-config` firestore.ts), es gibt also KEINE lokale
   * Kopie zum Anzeigen — die erste Emission muss über Long Polling vom Server kommen. Eine aus
   * dem Ruhezustand geweckte PWA hat dafür oft eine tote Verbindung, die der SDK noch nicht als
   * tot erkannt hat. Auf Android/Chrome kann derselbe Stillstand aus einem hängenden
   * IndexedDB-Open des persistenten Caches entstehen.
   *
   * 8 s ist grosszügig gegenüber einem echten, langsamen Kaltstart und immer noch weit unter
   * dem, was ein Benutzer als «hängt» empfindet.
   */
  private static readonly FIRST_SNAPSHOT_TIMEOUT_MS = 8_000;

  /** Zeitbudget für den einmaligen Ersatz-Lesevorgang; `getDocs` kann genauso hängen. */
  private static readonly FALLBACK_TIMEOUT_MS = 8_000;

  private readonly resource = rxResource({
    /**
     * Neu ausführen bei An- und Abmeldung. Ohne `params` wird `stream` GENAU EINMAL abonniert,
     * für die Lebensdauer der Anwendung: ein Listener, der vor dem Login stehen blieb, bekam nie
     * wieder eine Chance, und keine Anmeldung holte das Menü zurück. Der Schlüssel ist die
     * Benutzer-`okey` (ein Primitiv), nicht das Benutzerobjekt — der AppStore gibt bei jedem
     * Firestore-Tick eine neue Objektreferenz aus und würde die Ressource sonst dauernd neu laden.
     */
    params: () => this.appStore.currentUser()?.okey ?? '',
    stream: () => this.menuService.list().pipe(
      timeout({
        first: MenuItemsStore.FIRST_SNAPSHOT_TIMEOUT_MS,
        with: () => {
          // Den stummen, geteilten Listener verwerfen — sonst hängt sich jeder spätere
          // Abonnent an denselben an.
          this.menuService.clearListCache();
          console.warn('MenuItemsStore: no first snapshot within '
            + `${MenuItemsStore.FIRST_SNAPSHOT_TIMEOUT_MS} ms — falling back to a one-shot read.`);
          return from(this.menuService.listOnce()).pipe(
            timeout(MenuItemsStore.FALLBACK_TIMEOUT_MS),
            // Der Ersatzweg darf nicht seinerseits hängen bleiben: schlägt auch er fehl, ist ein
            // leeres Menü das ehrlichere Ergebnis als ein Spinner, der nie aufhört. Kein
            // Signalschreibzugriff hier — siehe `menuItems` unten.
            catchError((err) => {
              console.warn('MenuItemsStore: one-shot fallback failed too.', err);
              return of<MenuItemModel[]>([]);
            }),
          );
        },
      }),
    ),
  });

  /**
   * Kein `catchError` im Stream: `hasValue()` fängt den Fehlerfall ab, ohne dass `value()` wirft.
   * Ein `catchError`, das in ein Signal schreibt, liefe bei einem synchronen Fehler innerhalb der
   * Auswertung der Ressource — und ein Signalschreibzugriff ist dort verboten.
   */
  public readonly menuItems = computed<MenuItemModel[] | undefined>(
    () => this.resource.hasValue() ? this.resource.value() : undefined
  );
  public readonly isLoading = computed(() => this.resource.isLoading());
  public readonly hasLoadError = computed(() => this.resource.status() === 'error');

  constructor() {
    effect(() => {
      if (this.resource.status() === 'error') {
        debugData('MenuItemsStore: stream error', this.resource.error(), this.appStore.currentUser());
      }
    });
  }

  /** Nach einem Schreibvorgang auf `menuItems` — der Live-Stream selbst braucht das nicht. */
  public reload(): void {
    this.resource.reload();
  }
}
