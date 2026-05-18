import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonContent, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { BookingJournalModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';

const JournalViewStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      view_title:          '@finance.journal.operation.view.label',
      field_date:          '@finance.journal.field.date.label',
      field_title:         '@finance.journal.field.title.label',
      field_debit_account: '@finance.journal.field.debitAccount.label',
      field_credit_account:'@finance.journal.field.creditAccount.label',
      field_amount:        '@finance.journal.field.amount.label',
      field_notes:         '@finance.journal.field.notes.label',
    }),
  })),
);

@Component({
  selector: 'bk-journal-view-modal',
  standalone: true,
  providers: [JournalViewStore],
  imports: [
    SvgIconPipe, PrettyDatePipe,
    Header,
    IonContent, IonCard, IonCardContent, IonIcon, IonItem, IonLabel
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .view-label { font-size: 0.8rem; }
  `],
  template: `
    <bk-header [title]="store.i18n.view_title()" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if(entry(); as entry) {
        <ion-card>
          <ion-card-content>
            <!-- date -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_date() }}</p>
                <p class="view-value">{{ date() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- description -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_title() }}</p>
                <p class="view-value">{{ title() }}</p>
              </ion-label>
            </ion-item>
            <!-- debitAccount -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'information' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_debit_account() }}</p>
                <p class="view-value">{{ debitAccount() }}</p>
              </ion-label>
            </ion-item>
            <!-- creditAccount -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'information' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_credit_account() }}</p>
                <p class="view-value">{{ creditAccount() }}</p>
              </ion-label>
            </ion-item>
            <!-- amount -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_amount() }}</p>
                <p class="view-value">{{ amount() }}</p>
              </ion-label>
            </ion-item>
            <!-- notes -->
            @if(notes().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'chatbox' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.field_notes() }}</p>
                  <p class="view-value">{{ notes() }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class JournalViewModal {
  protected readonly store = inject(JournalViewStore);

  public readonly entry = input.required<BookingJournalModel>();

  protected readonly date = computed(() => this.entry()?.date ?? '');
  protected readonly title = computed(() => this.entry()?.title ?? '');
  protected readonly debitAccount = computed(() => this.entry()?.debitAccount ?? '');
  protected readonly creditAccount = computed(() => this.entry()?.creditAccount ?? '');
  protected readonly amount = computed(() => ((this.entry()?.totalAmount?.amount ?? 0) / 100).toFixed(2));
  protected readonly notes = computed(() => this.entry()?.notes ?? '');
}
