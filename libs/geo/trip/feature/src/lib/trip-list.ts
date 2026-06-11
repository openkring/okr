import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActionSheetController, IonBackdrop, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, PopoverController } from '@ionic/angular/standalone';

import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { RoleName, TripModel } from '@bk2/shared-models';

import { formatTripTime } from '@bk2/trip-util';
import { TripStore } from './trip.store';
import { getYear, getYearList, hasRole } from '@bk2/shared-util-core';

const STATE_OPTIONS = ['open', 'draft', 'closed', 'deleted', 'revised', 'corrected', 'all'];

@Component({
  selector: 'bk-trip-list',
  standalone: true,
  imports: [
    DatePipe, SvgIconPipe,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonMenuButton,
    IonIcon, IonContent, IonList, IonItem, IonLabel, IonItemDivider, IonPopover,
    IonChip, IonBackdrop,
  ],
  providers: [TripStore],
  template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar color="secondary">
          @if(showMenuButton() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ store.filteredTrips().length }} {{ store.i18n.list_title() }}</ion-title>
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

      @if(store.canWrite()) {
        <!-- description -->
        <ion-toolbar>
          <ion-item lines="none">
            <ion-label>{{ store.i18n.desc() }}</ion-label>
          </ion-item>
        </ion-toolbar>
        <ion-toolbar color="light">
          <ion-item lines="none" color="light">
            <ion-label>{{ store.i18n.warning_note() }}</ion-label>
          </ion-item>
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
              <ion-label>{{ day.date | date:'EEEE, d. MMMM yyyy':'':'de' }}</ion-label>
            </ion-item-divider>
            @for (trip of day.trips; track trip.bkey) {
              <ion-item button (click)="showActions(trip)">
                <ion-label>
                  <strong>{{ formatTime(trip.startTime) }}</strong>
                  {{ trip.resource?.name1 }}
                </ion-label>
                <ion-label slot="end">
                  {{ trip.customLocationLabel || trip.locations[0] || '' }}
                  @if (trip.distance > 0) { · {{ trip.distance }} km }
                </ion-label>
                <ion-chip slot="end" [color]="stateColor(trip.state)">{{ trip.state }}</ion-chip>
              </ion-item>
            }
          }
        </ion-list>
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

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.createTrip(); break;
      case 'reportDamage': await this.store.reportDamage(); break;
      case 'reportbug': await this.store.export('raw'); break;
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
    const options = createActionSheetOptions(trip.resource?.name1 ?? '');
    const canWrite = this.store.canWrite();
    const isOpen = trip.state === 'open' || trip.state === 'open.rev';
    const isDeleted = trip.state === 'deleted';

    if (canWrite && !isDeleted) {
      options.buttons.push(createActionSheetButton('edit', this.store.i18n.update(), this.store.imgixBaseUrl(), 'edit'));
    }
    if (canWrite && isOpen) {
      options.buttons.push(createActionSheetButton('end', this.store.i18n.end(), this.store.imgixBaseUrl(), 'flag'));
    }
    if (canWrite && !isDeleted) {
      options.buttons.push(createActionSheetButton('delete', this.store.i18n.delete(), this.store.imgixBaseUrl(), 'trash'));
    }
    options.buttons.push(createActionSheetButton('report_damage', this.store.i18n.report_damage(), this.store.imgixBaseUrl(), 'warning'));
    options.buttons.push(createActionSheetButton('report_bug', this.store.i18n.report_bug(), this.store.imgixBaseUrl(), 'bug'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.store.imgixBaseUrl(), 'close-circle'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'edit':          await this.store.editTrip(trip); break;
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
