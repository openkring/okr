import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SessionModel } from '@bk2/shared-models';
import { getSessionStatus } from '@bk2/session-util';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

interface DetailRow { label: string; value: string; }

@Component({
  selector: 'bk-session-detail-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`ion-row { border-bottom: 1px solid var(--ion-color-light); }`],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ closeLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        @for (row of rows(); track row.label) {
          <ion-row>
            <ion-col size="5"><strong>{{ row.label }}</strong></ion-col>
            <ion-col size="7">{{ row.value || '—' }}</ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `,
})
export class SessionDetailModal {
  private readonly modalController = inject(ModalController);

  public session = input.required<SessionModel>();
  public title = input('Session-Details');
  public closeLabel = input('Schliessen');

  protected rows = computed<DetailRow[]>(() => {
    const s = this.session();
    const fmt = (sdt: string) => sdt ? convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime) : '';
    return [
      { label: 'User', value: s.userEmail || 'anonym' },
      { label: 'Browser', value: s.browser },
      { label: 'OS', value: s.os },
      { label: 'Status', value: getSessionStatus(s, Date.now()) },
      { label: 'Started', value: fmt(s.startedAt) },
      { label: 'Last seen', value: fmt(s.lastSeenAt) },
      { label: 'Ended', value: fmt(s.endedAt) },
      { label: 'Duration (s)', value: String(s.durationSeconds) },
      { label: 'userKey', value: s.userKey },
      { label: 'bkey', value: s.bkey },
      { label: 'tenants', value: s.tenants.join(', ') },
    ];
  });

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
