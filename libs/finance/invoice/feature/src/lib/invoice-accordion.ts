import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import { InvoiceModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';

import { InvoiceStore } from './invoice.store';

@Component({
  selector: 'okr-invoice-accordion',
  standalone: true,
  providers: [InvoiceStore],
  imports: [
    SvgIconPipe,
    IonAccordion, IonItem, IonLabel, IonList, IonIcon,
  ],
  template: `
    <ion-accordion toggle-icon-slot="start" value="invoices">
      <ion-item slot="header" lines="none">
        <ion-label>{{ store.i18n.invoices() }}</ion-label>
        <ion-icon src="{{ 'invoice' | svgIcon }}" slot="end" />
      </ion-item>
      <div slot="content">
        <ion-list lines="inset">
          @for(invoice of myInvoices(); track invoice.okey) {
            <ion-item (click)="showActions(invoice)" button detail="false">
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
              <ion-label color="medium">{{ store.i18n.empty() }}</ion-label>
            </ion-item>
          }
        </ion-list>
      </div>
    </ion-accordion>
  `
})
export class InvoiceAccordion {
  protected readonly store = inject(InvoiceStore);
  private readonly actionSheetController = inject(ActionSheetController);

  /** 'my' (the current user's invoices) | the receiver key (e.g. an org's okey) */
  public readonly listId = input('my');

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly myInvoices = computed(() => this.store.filteredInvoices());

  constructor() {
    effect(() => this.store.setListId(this.listId()));
    // Outside the accounting routes nobody has chosen the books yet, and the invoices query waits for
    // them: fall back to the selected (else the app's default) books — never the app tenant.
    effect(() => {
      const accountingStore = this.store.accountingStore;
      const books = accountingStore.selectedBooks();
      if (!accountingStore.accountingTenantId() && books) accountingStore.setTenant(books);
    });
  }

  protected formatDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) ?? storeDate;
  }

  protected formatAmount(invoice: InvoiceModel): string {
    if (!invoice.totalAmount) return '';
    const amount = (invoice.totalAmount.amount / 100).toFixed(2);
    return `${invoice.totalAmount.currency} ${amount}`;
  }

  protected async showActions(invoice: InvoiceModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    const base = this.store.appStore.env.services.imgixBaseUrl;
    options.buttons.push(createActionSheetButton('invoice.view', this.store.i18n.view(), base, 'eye-on'));
    options.buttons.push(createActionSheetButton('invoice.showpdf', this.store.i18n.show_pdf(), base, 'download'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'invoice.view': await this.store.view(invoice); break;
      case 'invoice.showpdf': await this.store.showPdf(invoice); break;
    }
  }
}
