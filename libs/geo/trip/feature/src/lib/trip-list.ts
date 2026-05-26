import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  ActionSheetController,
  IonBackdrop, IonButton, IonButtons, IonChip, IonContent,
  IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel,
  IonList, IonMenuButton, IonSelect, IonSelectOption,
  IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { TripModel } from '@bk2/shared-models';

import { formatTripTime } from '@bk2/trip-util';
import { TripStore } from './trip.store';

const STATE_OPTIONS = ['open', 'draft', 'closed', 'deleted', 'revised', 'corrected', 'all'];

@Component({
  selector: 'bk-trip-list',
  standalone: true,
  imports: [
    DatePipe, SvgIconPipe,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonMenuButton,
    IonIcon, IonContent, IonList, IonItem, IonLabel, IonItemDivider,
    IonChip, IonBackdrop, IonSelect, IonSelectOption,
  ],
  providers: [TripStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.filteredTrips().length }} {{ store.i18n.list_title() }}</ion-title>
        @if (store.canWrite()) {
          <ion-buttons slot="end">
            <ion-button (click)="store.createTrip()">
              <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar>
        <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
        <ion-select
          slot="end"
          [value]="selectedState"
          (ionChange)="onStateChange($event)"
          interface="popover"
          style="max-width: 120px;"
        >
          @for (s of stateOptions; track s) {
            <ion-select-option [value]="s">{{ s }}</ion-select-option>
          }
        </ion-select>
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
  private readonly appStore = inject(AppStore);

  protected readonly stateOptions = STATE_OPTIONS;
  protected readonly formatTime = formatTripTime;
  protected selectedState = 'open';

  private get imgixBaseUrl(): string {
    return this.appStore.env.services.imgixBaseUrl;
  }

  protected onStateChange(event: CustomEvent): void {
    this.selectedState = event.detail.value;
    this.store.setStateFilter(this.selectedState);
  }

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

    if (canWrite) {
      options.buttons.push(createActionSheetButton('trip.add', this.store.i18n.as_add(), this.imgixBaseUrl, 'add-circle'));
    }
    if (canWrite && !isDeleted) {
      options.buttons.push(createActionSheetButton('trip.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
    }
    if (canWrite && isOpen) {
      options.buttons.push(createActionSheetButton('trip.end', this.store.i18n.as_end(), this.imgixBaseUrl, 'flag'));
    }
    if (canWrite && !isDeleted) {
      options.buttons.push(createActionSheetButton('trip.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetButton('trip.report_damage', this.store.i18n.as_report_damage(), this.imgixBaseUrl, 'warning'));
    options.buttons.push(createActionSheetButton('trip.report_bug', this.store.i18n.as_report_bug(), this.imgixBaseUrl, 'bug'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'close-circle'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'trip.add':           await this.store.createTrip(); break;
      case 'trip.edit':          await this.store.editTrip(trip); break;
      case 'trip.end':           await this.store.endTrip(trip); break;
      case 'trip.delete':        await this.store.deleteTrip(trip); break;
      case 'trip.report_damage': await this.store.reportDamage(trip); break;
      case 'trip.report_bug':    await this.store.reportBug(trip); break;
    }
  }
}
