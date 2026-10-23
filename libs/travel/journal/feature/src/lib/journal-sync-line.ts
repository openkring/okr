import { Component, computed, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';

import { fill } from '@okr/shared-util-core';
import { JournalSyncStatus } from '@okr/travel-journal-data-access';
import { JournalI18n, JournalPhotoMode } from '@okr/travel-journal-util';

/** The label of a photo mode. */
export function photoModeLabel(i18n: JournalI18n, mode: JournalPhotoMode): string {
  return mode === 'uploadOnly' ? i18n.photo_mode_uploadOnly() : mode === 'paused' ? i18n.photo_mode_paused() : i18n.photo_mode_all();
}

/**
 * One line about the Firebase sync (spec 1.113 plan 4): when it last ran, what is still waiting, or
 * that the device is offline. Tapping the text syncs now; the button chooses the photo mode.
 */
@Component({
  selector: 'okr-journal-sync-line',
  imports: [IonButton],
  styles: [`
    :host { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.8rem; color: var(--ion-color-medium); }
    span { cursor: pointer; }
  `],
  template: `
    <span (click)="syncNow.emit()" [attr.aria-label]="i18n().sync_now()">{{ text() }}</span>
    <ion-button size="small" fill="clear" (click)="choosePhotoMode.emit()">{{ modeText() }}</ion-button>
  `,
})
export class JournalSyncLine {
  public readonly status = input.required<JournalSyncStatus>();
  public readonly photoMode = input<JournalPhotoMode>('all');
  public readonly i18n = input.required<JournalI18n>();
  public readonly syncNow = output<void>();
  public readonly choosePhotoMode = output<void>();

  protected readonly modeText = computed(() => fill(this.i18n().photo_mode(), { mode: photoModeLabel(this.i18n(), this.photoMode()) }));

  protected readonly text = computed(() => {
    const status = this.status();
    const i18n = this.i18n();
    let text: string;
    if (status.state === 'syncing') text = i18n.sync_running();
    else if (status.state === 'offline') text = i18n.sync_offline();
    else if (status.state === 'error') text = i18n.sync_error();
    else if (status.pendingRecords > 0 || status.pendingPhotos > 0) {
      text = fill(i18n.sync_pending(), { records: status.pendingRecords, photos: status.pendingPhotos });
    } else if (status.lastSyncAt) {
      const at = new Date(status.lastSyncAt);
      text = fill(i18n.sync_done(), { time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` });
    } else text = i18n.sync_never();
    return text;
  });
}
