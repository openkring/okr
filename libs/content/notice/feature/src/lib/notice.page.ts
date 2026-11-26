// libs/content/notice/feature/src/lib/notice.page.ts
import { Component, ComponentRef, Type, ViewContainerRef, computed, effect, inject, input, inputBinding, signal, untracked, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle,
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular';
import { catchError, combineLatest, map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { I18nService } from '@okr/shared-i18n';
import { CalEventModel, NewsletterSubscriptionModel, NoticeAttachment, NoticeModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { convertDateFormatToString, DateFormat, fill, prettyFormatDateTime } from '@okr/shared-util-core';
import { AppStore } from '@okr/shared-feature';
// the blocks are drawn by a lazily loaded component: only the loader and the type are imported here, see the barrel's index.ts
import { loadArticleBlocks, type ArticleBlocks } from '@okr/cms-article-feature';
import { CalEventService } from '@okr/calendar-calevent-data-access';
import { NoticeService } from '@okr/content-notice-data-access';
import { NOTICE_I18N_KEYS, NoticeI18n } from '@okr/content-notice-util';
import { NewsletterSubscriptionService } from '@okr/relationship-newsletter-data-access';
import { isActiveSubscription, NEWSLETTER_I18N_KEYS, NewsletterI18n } from '@okr/relationship-newsletter-util';

/** for every notice, once loaded */
const articleBlocksType = signal<Type<ArticleBlocks> | undefined>(undefined);
/** the load under way, shared by the notices that ask meanwhile */
let articleBlocksLoading: Promise<void> | undefined;

/** Loads the block drawing once; a failure leaves the notice on its `body` (one warning) and the next notice opened tries again. */
function loadBlocks(): Promise<void> {
  articleBlocksLoading ??= loadArticleBlocks().then(
    (type) => { articleBlocksType.set(type); },
    (error: unknown) => { console.warn('NoticePage: the blocks could not be loaded', error); },
  ).finally(() => { articleBlocksLoading = undefined; });
  return articleBlocksLoading;
}

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
    IonHeader, IonToolbar, IonButton, IonButtons, IonBackButton, IonTitle, IonContent,
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
            @if (hasBlocks() && blocksType()) {
              <ng-container #blocksHost />
            } @else {
              <div class="body" [innerHTML]="notice.body"></div>
            }
            @if (newsletterSubscription(); as subscription) {
              <ion-button fill="outline" size="small" class="ion-margin-top" [disabled]="leaving()" (click)="leaveNewsletter(subscription)">
                {{ newsletterI18n.leave_notice() }}
              </ion-button>
            }
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

  private readonly subscriptionService = inject(NewsletterSubscriptionService);
  protected readonly newsletterI18n = inject(I18nService).translateAll(NEWSLETTER_I18N_KEYS) as NewsletterI18n;

  private readonly noticeResource = rxResource<NoticeModel | undefined, string>({
    params: () => this.noticeKey(),
    // a rules denial must not leave the resource in error state (value() would throw)
    stream: ({ params }) => this.noticeService.read(params).pipe(catchError(() => of(undefined))),
  });

  /** the blocks of the notice (spec 1.176 §9.3), already sanitized by the server; undefined = draw `body` */
  protected readonly blocks = computed(() => {
    const blocks = this.notice()?.blocks;
    return blocks && blocks.length > 0 ? blocks : undefined;
  });
  protected readonly hasBlocks = computed(() => !!this.blocks());
  protected readonly blocksType = articleBlocksType.asReadonly();
  /** where the blocks are created; a new one whenever its @if block is entered again */
  private readonly blocksHost = viewChild('blocksHost', { read: ViewContainerRef });

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
  /** The reader's own subscriptions, read only for a newsletter notice and a reader with a person. */
  private readonly subscriptionsResource = rxResource<NewsletterSubscriptionModel[], { groupKey: string; personKey: string }>({
    params: () => ({ groupKey: this.notice()?.newsletterGroupKey ?? '', personKey: this.appStore.currentUser()?.personKey ?? '' }),
    stream: ({ params }) => params.groupKey === '' || params.personKey === ''
      ? of([])
      : this.subscriptionService.listMine(this.env.tenantId, params.personKey).pipe(catchError(() => of([]))),
  });
  /** The reader's active subscription to the notice's newsletter; undefined hides the «Newsletter abbestellen» button. */
  protected readonly newsletterSubscription = computed(() => {
    const groupKey = this.notice()?.newsletterGroupKey ?? '';
    if (groupKey === '' || !this.subscriptionsResource.hasValue() || this.left()) return undefined;
    return this.subscriptionsResource.value().find((s) => s.groupKey === groupKey && isActiveSubscription(s));
  });
  protected readonly leaving = signal(false);
  private readonly left = signal(false);
  /** the notice already marked as read in this view */
  private markedRead = '';
  /** the notice whose blocks this view asked for: after a failure (offline, stale chunk) the next notice opened asks again */
  private blocksAskedFor?: string;

  constructor() {
    effect(() => {
      const key = this.notice()?.okey;
      if (!this.hasBlocks() || articleBlocksType()) return;
      untracked(() => {
        if (this.blocksAskedFor === key) return;
        this.blocksAskedFor = key;
        void loadBlocks();
      });
    });
    effect((onCleanup) => {
      const host = this.blocksHost();
      const type = this.blocksType();
      if (!host || !type) return;
      const ref = untracked(() => this.createBlocks(host, type));
      // before its first run: what throws there leaves nothing behind
      onCleanup(() => ref.destroy());
      untracked(() => ref.changeDetectorRef.detectChanges());
    });
    // the reader opened it: note that once (the Versand overview shows who read it)
    effect(() => {
      const notice = this.notice();
      const personKey = this.appStore.currentUser()?.personKey ?? '';
      if (!notice || !personKey || !(notice.recipients ?? []).includes(personKey)) return;
      untracked(() => {
        if (this.markedRead === notice.okey) return;
        this.markedRead = notice.okey;
        void this.noticeService.markRead(notice, personKey);
      });
    });
  }

  private createBlocks(host: ViewContainerRef, type: Type<ArticleBlocks>): ComponentRef<ArticleBlocks> {
    return host.createComponent(type, {
      bindings: [
        inputBinding('blocks', () => this.blocks() ?? []),
        // the server wrote the final texts
        inputBinding('placeholders', () => false),
      ],
    });
  }

  protected async leaveNewsletter(subscription: NewsletterSubscriptionModel): Promise<void> {
    this.leaving.set(true);
    try {
      const done = await this.subscriptionService.leaveWithConfirm(this.env.tenantId, subscription.okey, {
        confirm: fill(this.newsletterI18n.leave_confirm(), { name: subscription.groupName }),
        ok: this.newsletterI18n.leave(),
        cancel: this.newsletterI18n.cancel(),
        done: this.newsletterI18n.leave_done(),
        error: this.newsletterI18n.leave_error(),
      });
      if (done) this.left.set(true);
    } finally {
      this.leaving.set(false);
    }
  }

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
