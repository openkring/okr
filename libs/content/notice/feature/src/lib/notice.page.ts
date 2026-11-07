// libs/content/notice/feature/src/lib/notice.page.ts
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBackButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle,
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonTitle, IonToolbar,
} from '@ionic/angular';
import { catchError, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { NoticeAttachment, NoticeModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { prettyFormatDateTime } from '@okr/shared-util-core';
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
          <ion-back-button defaultHref="/" />
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
  protected readonly sentAt = computed(() => prettyFormatDateTime(this.notice()?.sentAt));
  protected readonly attachmentFailed = signal(false);

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
