import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { BillModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

import { BillStore } from './bill.store';

@Component({
  selector: 'bk-bill-accordion',
  standalone: true,
  providers: [BillStore],
  imports: [
    AsyncPipe, TranslatePipe,
    IonAccordion, IonItem, IonLabel, IonList,
  ],
  template: `
    <ion-accordion toggle-icon-slot="start" value="bills">
      <ion-item slot="header" lines="none">
        <ion-label>{{ '@finance.bill.accordion.title' | translate | async }}</ion-label>
      </ion-item>
      <div slot="content">
        <ion-list lines="inset">
          @for(bill of myBills(); track bill.bkey) {
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
              <ion-label color="medium">{{ '@finance.bill.field.empty' | translate | async }}</ion-label>
            </ion-item>
          }
        </ion-list>
      </div>
    </ion-accordion>
  `
})
export class BillAccordion implements OnInit {
  protected readonly store = inject(BillStore);
  private readonly actionSheetController = inject(ActionSheetController);

  public readonly listId = input.required<string>();

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly myBills = computed(() => this.store.filteredBills());
  protected readonly imgixBaseUrl = computed(() => this.store.appStore.env.services.imgixBaseUrl);

  public ngOnInit(): void {
    this.store.setListId(this.listId());
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
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    const base = this.imgixBaseUrl();
    options.buttons.push(createActionSheetButton('bill.view', base, 'eye-on'));
    if (bill.attachments.length > 0) {
      options.buttons.push(createActionSheetButton('bill.download', base, 'download'));
    }
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));

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
