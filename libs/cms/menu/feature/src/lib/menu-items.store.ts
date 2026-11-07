import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, filter, from, map, of, timeout } from 'rxjs';

import { AppStore, SelectedBooks } from '@okr/shared-feature';
import { MenuItemModel } from '@okr/shared-models';
import { debugData, hasRole, withOfflineSnapshot } from '@okr/shared-util-core';

import { MenuService } from '@okr/cms-menu-data-access';
import { ActiveMenu, canOpenMenu, findActiveMenu, lacksBooks } from '@okr/cms-menu-util';
import { resourceParams } from '@okr/shared-util-angular';

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
  private readonly router = inject(Router);
  private readonly selectedBooks = inject(SelectedBooks);

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
    params: resourceParams(() => this.appStore.currentUser()?.okey ?? ''),
    stream: () => this.menuService.list().pipe(
      // Offline cold start: the last menu seen on this device instead of an empty menu.
      withOfflineSnapshot<MenuItemModel[]>(`menu.${this.appStore.tenantId()}`),
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
  /**
   * «Lädt» nur, solange noch KEINE Liste vorliegt. Bei einem Neuladen (reload() nach einem
   * Schreibzugriff, neuer Schlüssel) behält die Ressource den bisherigen Wert; das Menü darf
   * dann nicht in den Spinner zurückfallen — `menu.ts` würde sonst alle Knoten abbauen und neu
   * aufbauen (2026-09-08: 197 Knoten, der grösste TBT-Posten des Dashboards).
   */
  public readonly isLoading = computed(() => this.resource.isLoading() && !this.resource.hasValue());
  public readonly hasLoadError = computed(() => this.resource.status() === 'error');

  /** Die aktuelle Url nach Weiterleitungen; `router.url` als Startwert, weil die erste Navigation schon gelaufen sein kann. */
  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Die zuletzt im Hauptmenü gewählte Zeile — Ersatz, wenn die Url zu keiner Zeile passt (z.B. eine Detailseite). */
  private readonly lastSelectedKey = signal('');

  /**
   * Die aktive Zeile des Hauptmenüs (`main_<tenantId>`) samt den `sub`-Zeilen darüber. Dieselbe
   * Sichtbarkeit wie beim Rendern (Rolle, `@BOOKS@` ohne Buchhaltung); das Ergebnis hängt an der Url,
   * nicht an einem Klick, damit auch ein Seitenaufruf oder «Zurück» die richtige Zeile markiert.
   */
  public readonly activeMenu = computed<ActiveMenu | undefined>(() => {
    const items = this.menuItems();
    if (!items) return undefined;
    const user = this.appStore.currentUser();
    const tokenContext = { version: '', tenantId: this.appStore.tenantId(), booksId: this.selectedBooks.current() };
    return findActiveMenu({
      rootKey: `main_${this.appStore.tenantId()}`,
      items,
      path: this.currentPath(),
      canSee: item => hasRole(item.roleNeeded, user) && !lacksBooks(item.url ?? '', tokenContext),
      tokenContext,
      lastSelectedKey: this.lastSelectedKey(),
    });
  });

  /** Merkt sich die gewählte Hauptmenü-Zeile für `activeMenu`, falls die Url zu keiner Zeile passt. */
  public noteSelected(key: string): void {
    this.lastSelectedKey.set(key);
  }

  constructor() {
    effect(() => {
      if (this.resource.status() === 'error') {
        debugData('MenuItemsStore: stream error', this.resource.error(), this.appStore.currentUser());
      }
    });
  }

  /**
   * Ob das Menü `name` für den aktuellen Benutzer etwas zeigt (`canOpenMenu`): die «…»-Schaltfläche
   * eines Kontextmenüs hängt daran, damit sie nie ein leeres Popover öffnet. Liest Signale —
   * im Template aufgerufen, wird es neu ausgewertet, sobald Liste oder Benutzer wechseln.
   */
  public canOpen(name: string | undefined): boolean {
    return canOpenMenu(this.menuItems(), name, this.appStore.currentUser());
  }

  /** Nach einem Schreibvorgang auf `menuItems` — der Live-Stream selbst braucht das nicht. */
  public reload(): void {
    this.resource.reload();
  }
}
