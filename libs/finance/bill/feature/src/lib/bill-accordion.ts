import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';
import { BillModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString } from '@okr/shared-util-core';

import { BillStore } from './bill.store';

@Component({
  selector: 'okr-bill-accordion',
  standalone: true,
  providers: [BillStore],
  imports: [
    SvgIconPipe,
    IonAccordion, IonIcon, IonItem, IonLabel, IonList,
  ],
  template: `
    <ion-accordion toggle-icon-slot="start" value="bills">
      <ion-item slot="header" lines="none">
        <ion-label>{{ store.i18n.bills() }}</ion-label>
        <ion-icon src="{{ 'invoice' | svgIcon }}" slot="end" />
      </ion-item>
      <div slot="content">
        <ion-list lines="inset">
          @for(bill of myBills(); track bill.okey) {
            <ion-item (click)="showActions(bill)" button detail="false">
              <ion-label>
                <strong>{{ bill.billId }}</strong> {{ bill.title }}
              </ion-label>
              <ion-label slot="end">
                {{ formatDate(bill.billDate) }} · {{ formatAmount(bill) }}
              </ion-label>
            </ion-item>
          }
          @if(myBills().length === 0 && !isLoading()) {
            <ion-item lines="none">
              <ion-label color="medium">{{ store.i18n.empty() }}</ion-label>
            </ion-item>
          }
        </ion-list>
      </div>
    </ion-accordion>
  `
})
export class BillAccordion {
  protected readonly store = inject(BillStore);
  private readonly actionSheetController = inject(ActionSheetController);

  /** 'all' | 'my' | the vendor key (e.g. an org's okey) */
  public readonly listId = input.required<string>();

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly myBills = computed(() => this.store.filteredBills());

  constructor() {
    effect(() => this.store.setListId(this.listId()));
    // Outside the accounting routes nobody has chosen the books yet, and the bills query waits for
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

  protected formatAmount(bill: BillModel): string {
    if (!bill.totalAmount) return '';
    const amount = (bill.totalAmount.amount / 100).toFixed(2);
    return `${bill.totalAmount.currency} ${amount}`;
  }

  protected async showActions(bill: BillModel): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    const base = this.store.appStore.env.services.imgixBaseUrl;
    options.buttons.push(createActionSheetButton('bill.view', this.store.i18n.view(), base, 'eye-on'));
    if (bill.attachments.length > 0) {
      options.buttons.push(createActionSheetButton('bill.download', this.store.i18n.download(), base, 'download'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'bill.view': await this.store.view(bill); break;
      case 'bill.download': await this.store.showPdf(bill); break;
    }
  }
}
