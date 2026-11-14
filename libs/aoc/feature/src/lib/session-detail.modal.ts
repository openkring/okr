import { Component, computed, input } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular';

import { SessionModel } from '@okr/shared-models';
import { getSessionStatus } from '@okr/session-util';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';
import { AocI18n } from '@okr/aoc-util';
import { Header } from '@okr/shared-ui';

interface DetailRow { label: string; value: string; }

@Component({
  selector: 'okr-session-detail-modal',
  standalone: true,
  imports: [
    Header, IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`ion-row { border-bottom: 1px solid var(--ion-color-light); }`],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
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
  public session = input.required<SessionModel>();
  public i18n = input.required<AocI18n>();
  public title = input('Session-Details');

  protected rows = computed<DetailRow[]>(() => {
    const s = this.session();
    const i = this.i18n();
    const fmt = (sdt: string) => sdt ? convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime) : '';
    const statusKey = getSessionStatus(s, Date.now());
    const statusLabel = {
      active: i.session_status_active(),
      stale: i.session_status_stale(),
      orphaned: i.session_status_orphaned(),
      ended: i.session_status_ended(),
    }[statusKey];
    return [
      { label: i.session_col_user(), value: s.userEmail || i.session_anonymous() },
      { label: i.session_col_browser(), value: s.browser },
      { label: i.session_col_os(), value: s.os },
      { label: i.session_col_status(), value: statusLabel },
      { label: i.session_col_started(), value: fmt(s.startedAt) },
      { label: 'Last seen', value: fmt(s.lastSeenAt) },
      { label: 'Ended', value: fmt(s.endedAt) },
      { label: i.session_col_duration(), value: String(s.durationSeconds) },
      { label: 'userKey', value: s.userKey },
      { label: 'okey', value: s.okey },
      { label: 'tenants', value: s.tenants.join(', ') },
    ];
  });
}
