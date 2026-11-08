// libs/content/notice/feature/src/lib/notice-list.page.ts
import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonItem, IonLabel, IonList, IonMenuButton, IonTitle, IonToolbar,
} from '@ionic/angular';
import { catchError, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { NoticeModel } from '@okr/shared-models';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { prettyFormatDateTime } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import { NoticeService } from '@okr/content-notice-data-access';
import { NOTICE_I18N_KEYS, NoticeI18n } from '@okr/content-notice-util';

/**
 * Mitteilungen (spec 1.145 §10): all of the reader's notices in this tenant, newest first — the page
 * behind the «Alle Mitteilungen» button of the dashboard section (`/notice`). Read-only; a row opens
 * the notice. Only the reader's own notices are listed (the `notices` read rule).
 */
@Component({
  selector: 'okr-notice-list-page',
  standalone: true,
  imports: [
    Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent,
    IonCard, IonCardContent, IonList, IonItem, IonLabel,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .subject { font-size: 1rem; font-weight: 600; }
    .meta { font-size: 0.8rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.list_title() }} ({{ notices().length }})</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (notices().length === 0) {
        <okr-empty-list [message]="i18n.empty()" />
      } @else {
        <ion-card>
          <ion-card-content>
            <ion-list lines="inset">
              @for (notice of notices(); track notice.okey) {
                <ion-item [button]="true" [detail]="true" (click)="open(notice)">
                  <ion-label>
                    <p class="meta">{{ sentAt(notice) }}@if (notice.senderName) { · {{ notice.senderName }} }</p>
                    <p class="subject">{{ notice.subject }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class NoticeListPage {
  private readonly appStore = inject(AppStore);
  private readonly noticeService = inject(NoticeService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService).translateAll(NOTICE_I18N_KEYS) as NoticeI18n;

  private readonly noticesResource = rxResource({
    params: resourceParams(() => ({ personKey: this.appStore.currentUser()?.personKey })),
    // a rules denial must not leave the resource in error state (value() would throw)
    stream: ({ params }) => this.noticeService.listMine(params.personKey).pipe(catchError(() => of([] as NoticeModel[]))),
  });
  protected readonly notices = computed(() => this.noticesResource.value() ?? []);
  protected readonly isLoading = computed(() => this.noticesResource.isLoading());

  protected sentAt(notice: NoticeModel): string {
    return prettyFormatDateTime(notice.sentAt);
  }

  protected async open(notice: NoticeModel): Promise<void> {
    await this.router.navigateByUrl(`/notice/${notice.okey}`);
  }
}
