import { computed, effect, inject, Injectable } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

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

  private readonly resource = rxResource({
    stream: () => this.menuService.list(),
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
