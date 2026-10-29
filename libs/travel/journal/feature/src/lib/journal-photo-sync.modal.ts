import { Component, computed, inject } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonItem, IonLabel, IonList, IonNote, IonRadio, IonRadioGroup,
  ModalController,
} from '@ionic/angular';

import { HeaderI18n, Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { JournalPeerStatus, JournalSyncStatus } from '@okr/travel-journal-data-access';
import { JOURNAL_PHOTO_MODES, JournalI18n, JournalPhotoMode } from '@okr/travel-journal-util';

import { JournalStore } from './journal.store';

/** The label of a photo mode. */
export function photoModeLabel(i18n: JournalI18n, mode: JournalPhotoMode): string {
  return mode === 'uploadOnly' ? i18n.photo_mode_uploadOnly() : mode === 'paused' ? i18n.photo_mode_paused() : i18n.photo_mode_all();
}

function photoModeInfo(i18n: JournalI18n, mode: JournalPhotoMode): string {
  return mode === 'uploadOnly' ? i18n.photo_sync_upload_only_info() : mode === 'paused' ? i18n.photo_sync_paused_info() : i18n.photo_sync_all_info();
}

/** When the Firebase sync last ran, what is still waiting, or that the device is offline (spec 1.113 plan 4). */
export function syncStatusText(i18n: JournalI18n, status: JournalSyncStatus): string {
  if (status.state === 'syncing') return i18n.sync_running();
  if (status.state === 'offline') return i18n.sync_offline();
  if (status.state === 'error') return i18n.sync_error();
  if (status.pendingRecords > 0 || status.pendingPhotos > 0) {
    return fill(i18n.sync_pending(), { records: status.pendingRecords, photos: status.pendingPhotos });
  }
  if (status.lastSyncAt) {
    const at = new Date(status.lastSyncAt);
    return fill(i18n.sync_done(), { time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` });
  }
  return i18n.sync_never();
}

/** Whether the other iPad is connected directly (P2P, plan 5); '' when there is nothing to say. */
export function peerStatusText(i18n: JournalI18n, peer: JournalPeerStatus | undefined): string {
  switch (peer?.state) {
    case 'connected':
      return peer.received > 0
        ? fill(i18n.peer_connected_received(), { names: peer.peers.join(', '), count: peer.received })
        : fill(i18n.peer_connected(), { names: peer.peers.join(', ') });
    case 'searching':
      return i18n.peer_searching();
    case 'noSecret':
      return i18n.peer_no_secret();
    default:
      return '';
  }
}

/**
 * «Fotos synchronisieren» (spec 1.126 §3): the three photo modes, each explained in one sentence, and the
 * current sync state. A mode applies on tap, as the old sheet did — there is nothing to confirm.
 */
@Component({
  selector: 'okr-journal-photo-sync-modal',
  imports: [Header, IonContent, IonList, IonRadioGroup, IonRadio, IonItem, IonLabel, IonNote, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton],
  styles: [`
    ion-label p { white-space: normal; }
    .peer.connected { color: var(--ion-color-success); }
  `],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-list>
        <ion-radio-group [value]="store.photoMode()" (ionChange)="setMode($event.detail.value)">
          @for (mode of modes; track mode) {
            <ion-item>
              <ion-radio [value]="mode" labelPlacement="end" justify="start">
                <ion-label>
                  <h2>{{ label(mode) }}</h2>
                  <p>{{ info(mode) }}</p>
                </ion-label>
              </ion-radio>
            </ion-item>
          }
        </ion-radio-group>
      </ion-list>
      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n.photo_sync_state_title() }}</ion-card-title></ion-card-header>
        <ion-card-content>
          <p>{{ statusText() }}</p>
          @if (peerText(); as peerText) {
            <ion-note class="peer" [class.connected]="store.peerStatus()?.state === 'connected'">{{ peerText }}</ion-note>
          }
          <ion-button expand="block" fill="outline" (click)="store.syncNow()">{{ i18n.sync_now() }}</ion-button>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class JournalPhotoSyncModal {
  protected readonly store = inject(JournalStore);
  protected readonly i18n = this.store.i18n;
  protected readonly modes = JOURNAL_PHOTO_MODES;

  protected readonly headerI18n = computed<HeaderI18n>(() => ({ title: this.i18n.photo_sync_title() }));
  protected readonly statusText = computed(() => syncStatusText(this.i18n, this.store.syncStatus()));
  protected readonly peerText = computed(() => peerStatusText(this.i18n, this.store.peerStatus()));

  protected label(mode: JournalPhotoMode): string {
    return photoModeLabel(this.i18n, mode);
  }

  protected info(mode: JournalPhotoMode): string {
    return photoModeInfo(this.i18n, mode);
  }

  protected setMode(mode: JournalPhotoMode): void {
    if (mode !== this.store.photoMode()) void this.store.setPhotoMode(mode);
  }
}

/** Opens «Fotos synchronisieren»; the modal reads the store live, so the state refreshes while it is open. */
export async function openPhotoSyncModal(modalController: ModalController): Promise<void> {
  const modal = await modalController.create({ component: JournalPhotoSyncModal });
  await modal.present();
}
