import { Component, computed, effect, inject, input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonBackdrop, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService } from '@okr/shared-util-angular';

import { Menu } from '@okr/cms-menu-feature';
import { ReportTable } from '@okr/finance-reporting-ui';

import { ReportingStore } from './reporting.store';

/**
 * Bilanz of the accounting tenant in the URL: Aktiven and Passiven as of the selected fiscal year's
 * end, previous year alongside, with the computed Jahresergebnis closing the Passiven.
 */
@Component({
  selector: 'okr-balance-sheet-page',
  standalone: true,
  imports: [
    SvgIconPipe, Menu, Spinner, EmptyList, ListFilter, ReportTable,
    IonHeader, IonToolbar, IonButtons, IonButton, IonMenuButton, IonTitle, IonIcon, IonPopover,
    IonContent, IonBackdrop, IonGrid, IonRow, IonCol, IonLabel,
  ],
  providers: [ReportingStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.balance_title() }} {{ store.currentFy().label }}</ion-title>
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true"
            [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content><okr-menu [menuName]="contextMenuName()" /></ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>
      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        (yearChanged)="store.setSelectedYear($event)" [years]="store.years()" [selectedYear]="store.year()"
      />
      <ion-toolbar color="primary">
        <ion-grid>
          <ion-row>
            <ion-col size-md="2" class="ion-hide-sm-down"><ion-label><strong>{{ store.i18n.col_account() }}</strong></ion-label></ion-col>
            <ion-col size="6" size-md="6"><ion-label><strong>{{ store.i18n.col_name() }}</strong></ion-label></ion-col>
            <ion-col size="3" size-md="2" class="ion-text-end"><ion-label><strong>{{ store.currentFy().label }}</strong></ion-label></ion-col>
            <ion-col size="3" size-md="2" class="ion-text-end"><ion-label><strong>{{ store.previousFy().label }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
        <ion-backdrop />
      } @else if (store.bookings().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <okr-report-table [rows]="store.balanceRows()" (groupToggled)="store.toggleExpand($event)" />
      }
    </ion-content>
  `,
})
export class BalanceSheetPage {
  protected readonly store = inject(ReportingStore);
  private readonly route = inject(ActivatedRoute);
  private readonly alertService = inject(AlertService);

  /** Name of the DB menu document loaded into the header context menu (route `:contextMenuName`). */
  public readonly contextMenuName = input.required<string>();
  protected readonly popupId = computed(() => `c_balance_${this.contextMenuName()}`);

  // `?year=<yyyy>` (query param): the period list opens the report for that fiscal year.
  // An invalid/absent value is ignored by the store, which then keeps the current fiscal year.
  public readonly year = input<string | undefined>();
  private readonly syncYear = effect(() => this.store.setSelectedYear(Number(this.year())));

  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setAccountingTenant(id);
    });
  }

  /** Context-menu actions: DB `call` items whose `url` is the method name. */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const method = $event.detail.data;
    if (!method) return;
    switch (method) {
      case 'exportCsv': await this.store.exportCsv('balance'); break;
      case 'toggleZero': this.store.toggleZero(); break;
      default: this.alertService.error(`BalanceSheetPage.onPopoverDismiss: unknown method ${method}`);
    }
  }
}
