import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject } from '@angular/core';
import { ActionSheetController, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { BookingJournalModel } from '@bk2/shared-models';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString, getYearList } from '@bk2/shared-util-core';

import { JournalStore } from './journal.store';

@Component({
  selector: 'bk-journal-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [JournalStore],
  imports: [
    AsyncPipe, TranslatePipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton,
    IonContent, IonLabel, IonGrid, IonRow, IonCol
  ],
  styles: [`
    .journal-date { font-size: 0.85rem; }
    .journal-title { font-size: 0.95rem; }
    .journal-account { font-size: 0.8rem; color: var(--ion-color-medium); }
    .amount { text-align: right; font-size: 0.9rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }} {{ '@finance.journal.list.title' | translate | async }}</ion-title>
      </ion-toolbar>
      <bk-list-filter
        [years]="yearList"
        [selectedYear]="selectedYear()"
        (searchTermChanged)="onSearchTermChange($event)"
        (yearChanged)="onYearChange($event)"
      />
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else if(filteredJournal().length === 0) {
        <bk-empty-list message="@finance.journal.field.empty" />
      } @else {
        <ion-grid>
          @for(entry of filteredJournal(); track entry.bkey) {
            <ion-row (click)="showActions(entry)">
              <ion-col size="2" class="ion-align-self-center journal-date">{{ formatDate(entry.date) }}</ion-col>
              <ion-col>
                <ion-label>
                  <p class="journal-title">{{ entry.title }}</p>
                  <p class="journal-account">S: {{ entry.debitAccount }} / H: {{ entry.creditAccount }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="3" class="ion-align-self-center amount">{{ getAmount(entry.totalAmount?.amount) }}</ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `
})
export class JournalList {
  protected readonly store = inject(JournalStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly filteredJournal = computed(() => this.store.filteredJournal());
  protected readonly filteredCount = computed(() => this.filteredJournal().length);
  protected readonly selectedYear = computed(() => this.store.selectedYear());
  protected readonly imgixBaseUrl = computed(() => this.store.appStore.env.services.imgixBaseUrl);

  protected readonly yearList = getYearList();

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onYearChange(year: number): void {
    this.store.setSelectedYear(year);
  }

  protected formatDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) ?? storeDate;
  }

  protected getAmount(cents?: number): string {
    if (cents === undefined) return '';
    return (cents / 100).toFixed(2);
  }

  protected async showActions(entry: BookingJournalModel): Promise<void> {
    const options = createActionSheetOptions('@actionsheet.label.choose');
    const base = this.imgixBaseUrl();
    options.buttons.push(createActionSheetButton('journal.view', base, 'eye-on'));
    options.buttons.push(createActionSheetButton('journal.showDebitAccount', base, 'information'));
    options.buttons.push(createActionSheetButton('journal.showCreditAccount', base, 'information'));
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'journal.view': await this.store.view(entry); break;
      case 'journal.showDebitAccount': break; // TODO: open account view
      case 'journal.showCreditAccount': break; // TODO: open account view
    }
    this.cdr.markForCheck();
  }
}
