import { Component, computed, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';

import { fill } from '@okr/shared-util-core';
import { JournalSyncStatus } from '@okr/travel-journal-data-access';
import { JournalI18n } from '@okr/travel-journal-util';

/**
 * One line about the Firebase sync (spec 1.113 plan 4): when it last ran, what is still waiting, or
 * that the device is offline. Tapping the text syncs now; the button pauses the photo transfer.
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
    <ion-button size="small" fill="clear" (click)="togglePhotos.emit()">
      {{ paused() ? i18n().photos_resume() : i18n().photos_pause() }}
    </ion-button>
  `,
})
export class JournalSyncLine {
  public readonly status = input.required<JournalSyncStatus>();
  public readonly paused = input(false);
  public readonly i18n = input.required<JournalI18n>();
  public readonly syncNow = output<void>();
  public readonly togglePhotos = output<void>();

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
    return this.paused() ? `${text} · ${i18n.photos_paused()}` : text;
  });
}
