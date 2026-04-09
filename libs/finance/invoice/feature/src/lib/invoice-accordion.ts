import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { IonAccordion, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { InvoiceModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

import { InvoiceStore } from './invoice.store';

@Component({
  selector: 'bk-invoice-accordion',
  standalone: true,
  providers: [InvoiceStore],
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    IonAccordion, IonItem, IonLabel, IonList, IonIcon,
  ],
  template: `
    <ion-accordion toggle-icon-slot="start" value="invoices">
      <ion-item slot="header" lines="none">
        <ion-label>{{ '@invoice.accordion.title' | translate | async }}</ion-label>
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
            </ion-item>
          }
          @if(myInvoices().length === 0 && !isLoading()) {
            <ion-item lines="none">
              <ion-label color="medium">{{ '@invoice.field.empty' | translate | async }}</ion-label>
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

  protected formatAmount(invoice: InvoiceModel): string {
    if (!invoice.totalAmount) return '';
    const amount = (invoice.totalAmount.amount / 100).toFixed(2);
    return `${invoice.totalAmount.currency} ${amount}`;
  }
}
