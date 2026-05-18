import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonChip, IonContent, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { InvoiceModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';

const InvoiceViewStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      view_title:         '@finance.invoice.operation.view.label',
      field_invoice_id:   '@finance.invoice.field.invoiceId.label',
      field_title:        '@finance.invoice.field.title.label',
      field_invoice_date: '@finance.invoice.field.invoiceDate.label',
      field_due_date:     '@finance.invoice.field.dueDate.label',
      field_amount:       '@finance.invoice.field.amount.label',
      field_state:        '@finance.invoice.field.state.label',
      field_payment_date: '@finance.invoice.field.paymentDate.label',
      field_notes:        '@finance.invoice.field.notes.label',
    }),
  })),
);

@Component({
  selector: 'bk-invoice-view-modal',
  standalone: true,
  providers: [InvoiceViewStore],
  imports: [
    SvgIconPipe, PrettyDatePipe,
    Header,
    IonContent, IonCard, IonIcon, IonLabel, IonCardContent, IonItem, IonChip
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .view-label { font-size: 0.8rem }
  `],
  template: `
    <bk-header [title]="store.i18n.view_title()" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if(invoice(); as invoice) {
        <ion-card>
          <ion-card-content>
            <!-- invoiceId -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'information' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_invoice_id() }}</p>
                <p class="view-value">{{ invoiceId() }}</p>
              </ion-label>
            </ion-item>
            <!-- title -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_title() }}</p>
                <p class="view-value">{{ title() }}</p>
              </ion-label>
            </ion-item>
            <!-- invoiceDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_invoice_date() }}</p>
                <p class="view-value">{{ invoiceDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- dueDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_due_date() }}</p>
                <p class="view-value">{{ dueDate() | prettyDate }}</p>
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
            <!-- state -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'target' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.field_state() }}</p>
                <ion-chip [outline]="true" size="small" [color]="getStateColor(state())">
                  {{ state() }}
                </ion-chip>
              </ion-label>
            </ion-item>
            <!-- paymentDate -->
            @if(paymentDate().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.field_payment_date() }}</p>
                  <p class="view-value">{{ paymentDate() | prettyDate }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- notes -->
            @if(invoice.notes.length > 0) {
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
export class InvoiceViewModal {
  protected readonly store = inject(InvoiceViewStore);

  public readonly invoice = input.required<InvoiceModel>();

  protected readonly title = computed(() => this.invoice()?.title ?? '');
  protected readonly invoiceId = computed(() => this.invoice()?.invoiceId ?? '');
  protected readonly invoiceDate = computed(() => this.invoice()?.invoiceDate ?? '');
  protected readonly dueDate = computed(() => this.invoice()?.dueDate ?? '');
  protected readonly amount = computed(() => ((this.invoice()?.totalAmount?.amount ?? 0) / 100).toFixed(2));
  protected readonly state = computed(() => this.invoice()?.state ?? 'draft');
  protected readonly paymentDate = computed(() => this.invoice()?.paymentDate ?? '');
  protected readonly notes = computed(() => this.invoice()?.notes ?? '');

  protected getStateColor(state: string): string {
    switch(state) {
      case 'paid': return 'success';
      case 'overdue': return 'danger';
      case 'draft': return 'warning';
    }
    return '';
  }
}
