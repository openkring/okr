import { Component, computed, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { FileTransferEventModel, FileTransferEventType, FileTransferModel } from '@okr/shared-models';
import { EmptyList, Header } from '@okr/shared-ui';
import { FILE_TRANSFER_I18N_KEYS, FileTransferI18n, formatFileTransferExpiry } from '@okr/content-file-transfer-util';

interface LogRow {
  key: string;
  at: string;
  what: string;
  who: string;
  file: string;
}

/**
 * The access log of one transfer (spec 1.115 §4.3/§4.6), read-only: when, what (created, sent,
 * opened, downloaded, ended, expired), through which personal link, which file. The caller loads
 * the events; this modal only presents them. Times are shown in the viewer's local time.
 */
@Component({
  selector: 'okr-file-transfer-log-modal',
  standalone: true,
  imports: [Header, EmptyList, IonContent, IonList, IonItem, IonLabel, IonNote],
  template: `
    <okr-header [i18n]="{ title: i18n.log_title() }" [isModal]="true" />
    <ion-content>
      @if (rows().length === 0) {
        <okr-empty-list [message]="i18n.log_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (row of rows(); track row.key) {
            <ion-item>
              <ion-label class="ion-text-wrap">
                <h3>{{ row.what }}@if (row.who) { · {{ row.who }} }</h3>
                @if (row.file) {
                  <p>{{ row.file }}</p>
                }
              </ion-label>
              <ion-note slot="end">{{ row.at }}</ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class FileTransferLogModal {
  // direct inject, no store: a feature store opens this modal, importing it back would be circular
  protected readonly i18n = inject(I18nService).translateAll(FILE_TRANSFER_I18N_KEYS) as FileTransferI18n;

  // inputs
  public readonly transfer = input.required<FileTransferModel>();
  public readonly events = input<FileTransferEventModel[]>([]);

  protected readonly rows = computed<LogRow[]>(() => {
    const t = this.transfer();
    const names = new Map(t.recipients.map(r => [r.id, r.name || r.email]));
    return this.events().map((e, i) => ({
      key: e.okey || String(i),
      at: formatFileTransferExpiry(e.at),
      what: this.eventLabel(e.type),
      who: e.recipientId ? (names.get(e.recipientId) ?? '') : (e.actorKey && e.actorKey === t.senderKey ? this.i18n.log_sender() : ''),
      file: e.fileIndex >= 0 ? (t.files.find(f => f.index === e.fileIndex)?.name ?? '') : '',
    }));
  });

  private eventLabel(type: FileTransferEventType): string {
    switch (type) {
      case 'created': return this.i18n.event_created();
      case 'sent': return this.i18n.event_sent();
      case 'opened': return this.i18n.event_opened();
      case 'downloaded': return this.i18n.event_downloaded();
      case 'ended': return this.i18n.event_ended();
      case 'expired': return this.i18n.event_expired();
      case 'limitRequested': return this.i18n.event_limitRequested();
      default: return type;
    }
  }
}
