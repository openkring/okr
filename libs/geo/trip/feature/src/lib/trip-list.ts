import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, IonBackdrop, IonButton, IonButtons, IonChip, IonCol, IonContent, IonFab, IonFabButton, IonGrid, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar, PopoverController } from '@ionic/angular/standalone';

import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { RoleName, TripModel } from '@bk2/shared-models';

import { formatTripTime, isTripEditable } from '@bk2/trip-util';
import { TripStore } from './trip.store';
import { getWeekdayI18nKey, getYear, getYearList, hasRole } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';
import { AvatarDisplay } from '@bk2/avatar-ui';

const STATE_OPTIONS = ['open', 'draft', 'closed', 'deleted', 'revised', 'corrected', 'all'];

@Component({
  selector: 'bk-trip-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe, TranslatePipe, AsyncPipe,
    Spinner, EmptyList, ListFilter, AvatarDisplay,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonMenuButton,
    IonIcon, IonContent, IonList, IonItem, IonLabel, IonItemDivider, IonPopover,
    IonChip, IonBackdrop, IonFab, IonFabButton
  ],
  providers: [TripStore],
  template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar color="secondary">
          @if(showMenuButton() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ store.i18n.list_title() }}</ion-title>
          <ion-buttons slot="end">
            <ion-button (click)="store.showInfo()">
              <ion-icon slot="icon-only" src="{{'info-circle' | svgIcon}}" />
            </ion-button>
          </ion-buttons>
          @if (store.canWrite()) {  <!-- kiosk or admin -->
            <ion-buttons slot="end">
              <ion-button id="c-trip">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon}}" />
              </ion-button>
              <ion-popover trigger="c-trip" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
                (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                <ng-template>
                  <ion-content>
                    <ion-list>
                      <ion-item button (click)="dismissPopover('add')">
                        <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
                        <ion-label>{{ store.i18n.create() }}</ion-label>
                      </ion-item>
                      <ion-item button (click)="dismissPopover('reportDamage')">
                        <ion-icon slot="start" src="{{'warning' | svgIcon}}" />
                        <ion-label>{{ store.i18n.report_damage() }}</ion-label>
                      </ion-item>
                      <ion-item button (click)="dismissPopover('reportBug')">
                        <ion-icon slot="start" src="{{'bug' | svgIcon}}" />
                        <ion-label>{{ store.i18n.report_bug() }}</ion-label>
                      </ion-item>
                      <ion-item button (click)="dismissPopover('showBoatStatistics')">
                        <ion-icon slot="start" src="{{'chart' | svgIcon}}" />
                        <ion-label>{{ store.i18n.show_statistics_boatkm() }}</ion-label>
                      </ion-item>
                      <ion-item button (click)="dismissPopover('showPersonStatistics')">
                        <ion-icon slot="start" src="{{'chart' | svgIcon}}" />
                        <ion-label>{{ store.i18n.show_statistics_personkm() }}</ion-label>
                      </ion-item>
                      <!-- tbd: Statistiken zeigen, Anleitung -->
                      @if(hasRole('admin')) {
                        <ion-item button (click)="dismissPopover('exportRaw')">
                          <ion-icon slot="start" src="{{'download' | svgIcon}}" />
                          <ion-label>{{ store.i18n.export_raw() }}</ion-label>
                        </ion-item>
                      }
                    </ion-list>
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          }
        </ion-toolbar>
      }

      <ion-toolbar>
        <bk-list-filter 
          (searchTermChanged)="store.setSearchTerm($event)"
          (stateChanged)="store.setSelectedState($event)" [states]="states()"
          (yearChanged)="store.setSelectedYear($event)" [years]="years()"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <bk-spinner />
        <ion-backdrop />
      } @else if (store.filteredTrips().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (day of store.groupedByDay(); track day.date) {
            <ion-item-divider>
              <ion-label>{{ getWeekdayI18n(day.date) | translate | async }}, {{ day.date | prettyDate}}</ion-label>
            </ion-item-divider>
            @for (trip of day.trips; track trip.bkey) {
              <ion-item button (click)="showActions(trip)">
                <ion-label>
                  {{ formatTime(trip.startTime) }}
                  {{ trip.resource?.name2 }}
                </ion-label>
                <bk-avatar-display [avatars]="trip.participants" [showName]="false" />
                <ion-label slot="end">
                  {{ trip.distance }} km
                </ion-label>
                <ion-chip slot="end" [color]="stateColor(trip.state)">{{ trip.state }}</ion-chip>
              </ion-item>
            }
          }
        </ion-list>
      }
      @if (hasRole('kiosk')) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button (click)="store.createTrip()">
            <ion-icon src="{{ 'add' | svgIcon }}" />
          </ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
})
export class TripList {
  protected readonly store = inject(TripStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly popoverController = inject(PopoverController);

  // inputs
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  public showMenuButton = input<boolean>(true);

  // filters
  protected selectedState = linkedSignal(() => this.store.selectedState());
  protected selectedYear = linkedSignal(() => this.store.selectedYear());

  // derived
  protected currentUser = computed(() => this.store.currentUser());
  protected states = computed(() => this.store.appStore.tryGetCategory('trip_state'));
  protected readonly years = computed(() => getYearList(getYear(), 5));

  // constants
  protected readonly stateOptions = STATE_OPTIONS;
  protected readonly formatTime = formatTripTime;

  /******************************* context menu *************************************** */
  protected async dismissPopover(action: string): Promise<void> {
    await this.popoverController.dismiss(action);
  }

  protected getWeekdayI18n(date: string): string {
    return getWeekdayI18nKey(date, false);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.createTrip(); break;
      case 'reportDamage': await this.store.reportDamage(this.currentUser()); break;
      case 'reportBug': await this.store.reportBug(this.currentUser()); break;
      case 'showBoatStatistics': await this.store.showBoatStatistics(); break;
      case 'showPersonStatistics': await this.store.showPersonStatistics(); break;
      case 'exportRaw': await this.store.export('raw'); break;
      default: error(undefined, `IconList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /******************************* actions *************************************** */

  protected stateColor(state: string): string {
    if (state === 'open' || state.startsWith('open')) return 'success';
    if (state === 'deleted') return 'danger';
    if (state.endsWith('.rev') || state.endsWith('.corr')) return 'warning';
    return 'medium';
  }

  protected async showActions(trip: TripModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    const canWrite = this.store.canWrite();
    const isOpen = trip.state === 'open' || trip.state === 'open.rev';
    const isDeleted = trip.state === 'deleted';

    if (canWrite && !isDeleted) {
      if (isTripEditable(trip)) {
        options.buttons.push(createActionSheetButton('edit', this.store.i18n.update(), this.store.imgixBaseUrl(), 'edit'));
      } else {
        // more than 15 min after the trip ended: read-only view instead of edit
        options.buttons.push(createActionSheetButton('view', this.store.i18n.view(), this.store.imgixBaseUrl(), 'eye-on'));
      }
    }
    if (canWrite && isOpen) {
      options.buttons.push(createActionSheetButton('end', this.store.i18n.end(), this.store.imgixBaseUrl(), 'stop-circle'));
    }
    if (canWrite && !isDeleted) {
      options.buttons.push(createActionSheetButton('delete', this.store.i18n.delete(), this.store.imgixBaseUrl(), 'trash'));
    }
    options.buttons.push(createActionSheetButton('report_damage', this.store.i18n.report_damage(), this.store.imgixBaseUrl(), 'warning'));
    options.buttons.push(createActionSheetButton('report_bug', this.store.i18n.report_bug(), this.store.imgixBaseUrl(), 'bug'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.store.imgixBaseUrl(), 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'edit':          await this.store.editTrip(trip); break;
      case 'view':          await this.store.viewTrip(trip); break;
      case 'end':           await this.store.endTrip(trip); break;
      case 'delete':        await this.store.deleteTrip(trip); break;
      case 'report_damage': await this.store.reportDamage(this.currentUser(), trip); break;
      case 'report_bug':    await this.store.reportBug(this.currentUser(), trip); break;
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

}
