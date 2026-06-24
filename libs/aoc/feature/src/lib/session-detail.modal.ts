import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SessionModel } from '@bk2/shared-models';
import { getSessionStatus } from '@bk2/session-util';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';
import { AocI18n } from '@bk2/aoc-util';

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
  public i18n = input.required<AocI18n>();
  public title = input('Session-Details');
  public closeLabel = input('Schliessen');

  protected rows = computed<DetailRow[]>(() => {
    const s = this.session();
    const i = this.i18n();
    const fmt = (sdt: string) => sdt ? convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime) : '';
    return [
      { label: i.session_col_user(), value: s.userEmail || i.session_anonymous() },
      { label: i.session_col_browser(), value: s.browser },
      { label: i.session_col_os(), value: s.os },
      { label: i.session_col_status(), value: getSessionStatus(s, Date.now()) },
      { label: i.session_col_started(), value: fmt(s.startedAt) },
      { label: 'Last seen', value: fmt(s.lastSeenAt) },
      { label: 'Ended', value: fmt(s.endedAt) },
      { label: i.session_col_duration(), value: String(s.durationSeconds) },
      { label: 'userKey', value: s.userKey },
      { label: 'bkey', value: s.bkey },
      { label: 'tenants', value: s.tenants.join(', ') },
    ];
  });

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
