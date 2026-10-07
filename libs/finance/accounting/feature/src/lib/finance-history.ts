import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';

import { CommentComposer, CommentsList } from '@okr/comment-ui';
import { COMMENT_LIST_I18N_KEYS, CommentListI18n } from '@okr/comment-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { resourceParams } from '@okr/shared-util-angular';
import { FinanceHistoryService } from '@okr/finance-accounting-data-access';
import { ACCOUNTING_I18N_KEYS, AccountingI18n } from '@okr/finance-accounting-util';

/**
 * The Verlauf of an invoice or bill: what happened to it (issued, sent by email to whom, reminders, payments,
 * storno — written by the Cloud Functions), the comments migrated from bexio, and notes the treasurer adds
 * here (e.g. a member's answer pasted from an email). Oldest first; nothing is edited or deleted.
 * Treasurer/privileged only — the caller decides whether to show it.
 */
@Component({
  selector: 'okr-finance-history',
  standalone: true,
  imports: [CommentsList, CommentComposer, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  styles: [`
    .composer { display: block; margin-top: 14px; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n.history_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <okr-comments-list [comments]="entries()" [empty]="i18n.history_empty()" [currentPersonKey]="currentPersonKey()" />
        @if (!readOnly()) {
          <okr-comment-composer class="composer" [i18n]="composerI18n" [canAttach]="false"
            [isBusy]="isSaving()" (sent)="addNote($event)" />
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class FinanceHistory {
  private readonly historyService = inject(FinanceHistoryService);
  private readonly appStore = inject(AppStore);
  private readonly i18nService = inject(I18nService);
  // direct inject: this component sits in modals the feature stores open
  protected readonly i18n = this.i18nService.translateAll(ACCOUNTING_I18N_KEYS) as AccountingI18n;
  protected readonly composerI18n = this.i18nService.translateAll(COMMENT_LIST_I18N_KEYS) as CommentListI18n;

  /** `invoice.<okey>` or `bill.<okey>` */
  public readonly parentKey = input.required<string>();
  /** true hides the note composer (the history itself always shows) */
  public readonly readOnly = input<boolean>(false);

  private readonly entriesResource = rxResource({
    params: resourceParams(() => ({ parentKey: this.parentKey() })),
    stream: ({ params }) => this.historyService.list(params.parentKey),
  });
  protected readonly entries = computed(() => this.entriesResource.value() ?? []);
  protected readonly currentPersonKey = computed(() => this.appStore.currentUser()?.personKey ?? '');
  protected readonly isSaving = signal(false);

  protected async addNote(text: string): Promise<void> {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    try {
      await this.historyService.addNote(this.parentKey(), text, this.appStore.currentUser() ?? undefined);
    } finally {
      this.isSaving.set(false);
    }
  }
}
