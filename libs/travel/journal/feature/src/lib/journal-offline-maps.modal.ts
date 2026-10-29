import { Component, computed, inject, input } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { Header, HeaderI18n, MapView } from '@okr/shared-ui';

import { JournalOfflineMap } from './journal-offline-map';
import { JournalStore } from './journal.store';

/**
 * «Offline-Karten verwalten» (spec 1.126 §4) — phase 1: the existing offline-map status, download and «Gebiete» sheet
 * in a modal instead of on the overview. Phase 4 replaces the body with the available/downloaded lists (§7.3).
 */
@Component({
  selector: 'okr-journal-offline-maps-modal',
  imports: [Header, IonContent, JournalOfflineMap],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content class="ion-padding">
      <okr-journal-offline-map [journalKey]="journalKey()" [view]="view()" />
    </ion-content>
  `,
})
export class JournalOfflineMapsModal {
  private readonly store = inject(JournalStore);

  public readonly journalKey = input.required<string>();
  /** The overview map's view when the modal opened — the candidate for «Kartenausschnitt hinzufügen». */
  public readonly view = input<MapView | undefined>(undefined);

  protected readonly headerI18n = computed<HeaderI18n>(() => ({ title: this.store.i18n.offline_maps_title() }));
}

export async function openOfflineMapsModal(modalController: ModalController, journalKey: string, view: MapView | undefined): Promise<void> {
  const modal = await modalController.create({ component: JournalOfflineMapsModal, componentProps: { journalKey, view } });
  await modal.present();
}
