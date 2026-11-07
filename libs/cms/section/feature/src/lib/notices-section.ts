import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonCard, IonCardContent, IonItem, IonLabel, IonList } from '@ionic/angular';
import { catchError, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { NoticeModel, NoticesConfig, SectionModel } from '@okr/shared-models';
import { EmptyList, MoreButton, OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { prettyFormatDateTime } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import { NoticeService } from '@okr/content-notice-data-access';
import { NOTICE_I18N_KEYS, NoticeI18n } from '@okr/content-notice-util';

/**
 * Mitteilungen (spec 1.145 §10): the reader's latest notices — the In-App delivery of a Versand.
 * A row opens the notice page. Only the reader's own notices are listed (the `notices` read rule).
 */
@Component({
  selector: 'okr-notices-section',
  standalone: true,
  imports: [OptionalCardHeader, Spinner, EmptyList, MoreButton, IonCard, IonCardContent, IonList, IonItem, IonLabel],
  styles: [`
    .subject { font-size: 1rem; font-weight: 600; }
    .meta { font-size: 0.8rem; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
  `],
  template: `
    @if (isLoading()) {
      <okr-spinner />
    } @else {
      <ion-card>
        <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if (notices().length === 0) {
            <okr-empty-list [message]="i18n.empty()" />
          } @else {
            <ion-list lines="inset">
              @for (notice of notices(); track notice.okey) {
                <ion-item [button]="true" [detail]="false" (click)="open(notice)">
                  <ion-label>
                    <p class="meta">{{ sentAt(notice) }}@if (notice.senderName) { · {{ notice.senderName }} }</p>
                    <p class="subject">{{ notice.subject }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
          @if (moreUrl().length > 0 && !editMode()) {
            <okr-more-button [url]="moreUrl()" [label]="i18n.more()" />
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class NoticesSectionComponent {
  private readonly appStore = inject(AppStore);
  private readonly noticeService = inject(NoticeService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService).translateAll(NOTICE_I18N_KEYS) as NoticeI18n;

  public section = input<SectionModel>();
  public editMode = input<boolean>(false);

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  private readonly config = computed(() => this.section()?.properties as NoticesConfig | undefined);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');

  private readonly noticesResource = rxResource({
    params: resourceParams(() => ({ personKey: this.appStore.currentUser()?.personKey, maxItems: this.config()?.maxItems })),
    stream: ({ params }) => this.noticeService.listMine(params.personKey, params.maxItems).pipe(catchError(() => of([] as NoticeModel[]))),
  });
  protected readonly notices = computed(() => this.noticesResource.value() ?? []);
  protected readonly isLoading = computed(() => this.noticesResource.isLoading());

  protected sentAt(notice: NoticeModel): string {
    return prettyFormatDateTime(notice.sentAt);
  }

  protected async open(notice: NoticeModel): Promise<void> {
    if (this.editMode()) return;
    await this.router.navigateByUrl(`/notice/${notice.okey}`);
  }
}
