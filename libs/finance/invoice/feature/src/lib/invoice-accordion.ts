import { Component, computed, inject, OnInit } from '@angular/core';
import { IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';
import { InvoiceModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

import { InvoiceStore } from './invoice.store';

@Component({
  selector: 'bk-invoice-accordion',
  standalone: true,
  providers: [InvoiceStore],
  imports: [
    SvgIconPipe,
    IonAccordion, IonButton, IonItem, IonLabel, IonList, IonIcon,
  ],
  template: `
    <ion-accordion toggle-icon-slot="start" value="invoices">
      <ion-item slot="header" lines="none">
        <ion-label>{{ store.i18n.invoices() }}</ion-label>
        <ion-icon src="{{ 'invoice' | svgIcon }}" slot="end" />
      </ion-item>
      <div slot="content">
        <ion-list lines="inset">
          @for(invoice of myInvoices(); track invoice.bkey) {
            <ion-item>
              <ion-label>
                <strong>{{ invoice.invoiceId }}</strong> {{ invoice.title }}
              </ion-label>
              <ion-label slot="end">
                {{ formatDate(invoice.invoiceDate) }} · {{ formatAmount(invoice) }}
              </ion-label>
              <ion-button slot="end" fill="clear" (click)="showPdf(invoice)">
                <ion-icon src="{{ 'download' | svgIcon }}" slot="icon-only" />
              </ion-button>
            </ion-item>
          }
          @if(myInvoices().length === 0 && !isLoading()) {
            <ion-item lines="none">
              <ion-label color="medium">{{ store.i18n.empty() }}</ion-label>
            </ion-item>
          }
        </ion-list>
      </div>
    </ion-accordion>
  `
})
export class InvoiceAccordion implements OnInit {
  protected readonly store = inject(InvoiceStore);

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly myInvoices = computed(() => this.store.filteredInvoices());

  public ngOnInit(): void {
    this.store.setListId('my');
  }

  protected formatDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) ?? storeDate;
  }

  protected showPdf(invoice: InvoiceModel): void {
    this.store.showPdf(invoice);
  }

  protected formatAmount(invoice: InvoiceModel): string {
    if (!invoice.totalAmount) return '';
    const amount = (invoice.totalAmount.amount / 100).toFixed(2);
    return `${invoice.totalAmount.currency} ${amount}`;
  }
}
