// libs/content/notice/feature/src/lib/notice.page.ts
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBackButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle,
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular';
import { catchError, combineLatest, map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { CalEventModel, NoticeAttachment, NoticeModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { convertDateFormatToString, DateFormat, prettyFormatDateTime } from '@okr/shared-util-core';
import { AppStore } from '@okr/shared-feature';
import { CalEventService } from '@okr/calendar-calevent-data-access';
import { NoticeService } from '@okr/content-notice-data-access';
import { NOTICE_I18N_KEYS, NoticeI18n } from '@okr/content-notice-util';

/**
 * One Mitteilung (spec 1.145 §10), opened from the dashboard section or from its push
 * (`/notice/:noticeKey`). Read-only. A notice the reader may not see, or one of another tenant,
 * shows the not-found state: the rules deny it, and the read error is swallowed into `undefined`.
 */
@Component({
  selector: 'okr-notice-page',
  standalone: true,
  imports: [
    SvgIconPipe, EmptyList, Spinner,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonList, IonListHeader, IonItem, IonLabel, IonIcon, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .body { line-height: 1.5; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/notice" />
        </ion-buttons>
        <ion-title>{{ i18n.title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (notice(); as notice) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ notice.subject }}</ion-card-title>
            <ion-card-subtitle>
              @if (notice.senderName) { {{ i18n.from() }} {{ notice.senderName }} · }{{ i18n.sent() }} {{ sentAt() }}
            </ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <div class="body" [innerHTML]="notice.body"></div>
          </ion-card-content>
        </ion-card>
        @if (events().length > 0) {
          <ion-card>
            <ion-list lines="full">
              <ion-list-header><ion-label>{{ i18n.events() }}</ion-label></ion-list-header>
              @for (event of events(); track event.okey) {
                <ion-item [button]="true" [detail]="true" (click)="openEvent(event)">
                  <ion-icon slot="start" src="{{ 'calendar' | svgIcon }}" />
                  <ion-label>
                    <h3>{{ event.name }}</h3>
                    <p>{{ eventWhen(event) }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-card>
        }
        @if (notice.attachments.length > 0) {
          <ion-card>
            <ion-list lines="full">
              <ion-list-header><ion-label>{{ i18n.attachments() }}</ion-label></ion-list-header>
              @for (att of notice.attachments; track att.storagePath) {
                <ion-item [button]="true" [detail]="false" (click)="open(notice, att)">
                  <ion-icon slot="start" src="{{ 'attachment' | svgIcon }}" />
                  <ion-label>{{ att.filename }}</ion-label>
                </ion-item>
              }
            </ion-list>
            @if (attachmentFailed()) {
              <ion-note color="danger" class="ion-padding">{{ i18n.attachment_error() }}</ion-note>
            }
          </ion-card>
        }
      } @else {
        <okr-empty-list [message]="i18n.not_found()" />
      }
    </ion-content>
  `,
})
export class NoticePage {
  /** Route param `:noticeKey`. */
  public readonly noticeKey = input.required<string>();

  private readonly env = inject(ENV);
  private readonly noticeService = inject(NoticeService);
  private readonly calEventService = inject(CalEventService);
  private readonly appStore = inject(AppStore);
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(NOTICE_I18N_KEYS) as NoticeI18n;

  private readonly noticeResource = rxResource<NoticeModel | undefined, string>({
    params: () => this.noticeKey(),
    // a rules denial must not leave the resource in error state (value() would throw)
    stream: ({ params }) => this.noticeService.read(params).pipe(catchError(() => of(undefined))),
  });

  protected readonly isLoading = computed(() => this.noticeResource.isLoading());
  /** undefined for missing, denied, archived or another tenant's notice → not-found state */
  protected readonly notice = computed(() => {
    const notice = this.noticeResource.value();
    return notice && !notice.isArchived && (notice.tenants ?? []).includes(this.env.tenantId) ? notice : undefined;
  });
  /** The events the Versand asked about; one the reader may not read, or one gone or archived, is left out. */
  private readonly eventsResource = rxResource<CalEventModel[], string[]>({
    params: () => this.notice()?.caleventKeys ?? [],
    stream: ({ params }) => params.length === 0 ? of([]) : combineLatest(params.map((key): Observable<CalEventModel | undefined> =>
      this.calEventService.read(key).pipe(catchError(() => of(undefined))),
    )).pipe(map((events) => events
      .filter((e): e is CalEventModel => !!e && !e.isArchived)
      .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime)))),
  });
  protected readonly events = computed(() => this.eventsResource.hasValue() ? this.eventsResource.value() : []);
  protected readonly sentAt = computed(() => prettyFormatDateTime(this.notice()?.sentAt));
  protected readonly attachmentFailed = signal(false);

  protected eventWhen(event: CalEventModel): string {
    const date = convertDateFormatToString(event.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    return event.startTime ? `${date}, ${event.startTime}` : date;
  }

  /** The event in its view modal, as the invitations section opens it. Loaded lazily: the calevent feature is heavy. */
  protected async openEvent(calevent: CalEventModel): Promise<void> {
    const { CalEventViewModal } = await import('@okr/calendar-calevent-feature');
    const modal = await this.modalController.create({
      component: CalEventViewModal,
      componentProps: {
        calevent,
        periodicities: this.appStore.getCategory('periodicity'),
        locale: this.appStore.appConfig().locale,
      },
    });
    await modal.present();
  }

  protected async open(notice: NoticeModel, attachment: NoticeAttachment): Promise<void> {
    this.attachmentFailed.set(false);
    // Opened inside the click, before the await: Safari blocks a window.open that follows one.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await this.noticeService.attachmentUrl(notice.okey, attachment.filename);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      console.error('NoticePage.open: getNoticeAttachment failed', err);
      this.attachmentFailed.set(true);
    }
  }
}
