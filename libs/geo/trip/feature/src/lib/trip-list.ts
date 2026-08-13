import { Component, computed, DestroyRef, effect, inject, input, linkedSignal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { ActionSheetController, IonBackdrop, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonMenuButton, IonPopover, IonRefresher, IonRefresherContent, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { ConnectionStatusButton, EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, keepDefaultTrue } from '@okr/shared-util-angular';
import { RoleName, TripModel } from '@okr/shared-models';

import { Menu } from '@okr/cms-menu-feature';
import { MenuService } from '@okr/cms-menu-data-access';

import { formatTripTime, isTripDeletable, isTripEditable } from '@okr/trip-util';
import { TripStore } from './trip.store';
import { getCategoryIcon, getWeekdayI18nKey, getYear, getYearList, hasRole } from '@okr/shared-util-core';
import { TranslatePipe } from '@okr/shared-i18n';
import { AsyncPipe } from '@angular/common';
import { AvatarDisplay } from '@okr/avatar-ui';

const STATE_OPTIONS = ['open', 'draft', 'closed', 'deleted', 'revised', 'corrected', 'all'];

@Component({
  selector: 'okr-trip-list',
  standalone: true,
  imports: [
    SvgIconPipe, PrettyDatePipe, TranslatePipe, AsyncPipe,
    Spinner, EmptyList, ListFilter, AvatarDisplay, Menu, ConnectionStatusButton,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonMenuButton,
    IonIcon, IonContent, IonList, IonItem, IonLabel, IonItemDivider, IonPopover,
    IonBackdrop, IonFab, IonFabButton, IonRefresher, IonRefresherContent
  ],
  providers: [TripStore],
  template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar color="secondary" [class.kiosk-toolbar]="hasRole('kiosk')">
          @if(hasRole('kiosk')) {
            <!-- the kiosk has no menu, so the connection dot takes the hamburger's place —
                 it is the one thing someone standing at the boathouse iPad needs to see -->
            <ion-buttons slot="start"><okr-connection-status-button /></ion-buttons>
          } @else if(showMenuButton() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ store.i18n.list_title() }}</ion-title>
          <ion-buttons slot="end">
            <ion-button (click)="store.showInfo()">
              <ion-icon slot="icon-only" src="{{'info-circle' | svgIcon}}" />
            </ion-button>
          </ion-buttons>
          @if (canOpenContextMenu()) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon}}" />
              </ion-button>
              <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
                (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                <ng-template>
                  <ion-content>
                    <okr-menu [menuName]="contextMenuName()" />
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          }
        </ion-toolbar>
      }

      <ion-toolbar>
        <!-- search + year only, 6 cols each up to md, 3 cols each above -->
        <okr-list-filter [mdSize]="3"
          (searchTermChanged)="store.setSearchTerm($event)"
          (yearChanged)="store.setSelectedYear($event)" [years]="years()"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- pull down to rebuild the Firestore listener: the kiosk has no browser chrome to reload with -->
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)">
        <ion-refresher-content />
      </ion-refresher>
      @if (store.isLoading()) {
        <okr-spinner />
        <ion-backdrop />
      } @else if (store.filteredTrips().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (day of store.groupedByDay(); track day.date) {
            <ion-item-divider>
              <ion-label>{{ getWeekdayI18n(day.date) | translate | async }}, {{ day.date | prettyDate}}</ion-label>
            </ion-item-divider>
            @for (trip of day.trips; track trip.okey) {
              <ion-item button (click)="showActions(trip)">
                @if(stateIcon(trip.state); as icon) {
                  <ion-icon slot="start" [color]="stateColor(trip.state)" src="{{ icon | svgIcon }}" />
                }
                <ion-label>
                  {{ formatTime(trip.startTime) }}
                  {{ trip.resource?.name2 }}
                </ion-label>
                <okr-avatar-display [avatars]="trip.participants" [showName]="false" />
                <ion-label slot="end">
                  {{ trip.distance }} km
                </ion-label>
              </ion-item>
            }
          }
        </ion-list>
      }
      @if (hasRole('kiosk') && store.locked()) {
        <!-- remotely locked from the AOC kiosk screen: readable, but no new entries -->
        <ion-item color="warning" lines="none">
          <ion-icon slot="start" src="{{ 'lock-closed' | svgIcon }}" />
          <ion-label class="ion-text-wrap">{{ store.i18n.locked() }}</ion-label>
        </ion-item>
      }
      @if (hasRole('kiosk') && store.canWrite()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end" style="margin-bottom: 50px; margin-right: 50px;">
          <ion-fab-button class="kiosk-fab" (click)="store.createTrip()">
            <ion-icon src="{{ 'add' | svgIcon }}" />
          </ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
  styles: [`
    /* kiosk (tablet, large font): grow the toolbar by 50% and park the end buttons
       at its bottom, away from the right border, so they stay in thumb reach */
    .kiosk-toolbar {
      --min-height: 84px; /* 56px default toolbar + 50% */
    }
    .kiosk-toolbar ion-buttons[slot="end"] {
      align-self: flex-end;
      margin-bottom: 8px;
      margin-inline-end: 24px;
    }
    .kiosk-fab {
      --border-radius: 50%;
      width: 96px;
      height: 96px;
    }
    .kiosk-fab ion-icon {
      font-size: 48px;
    }
  `],
})
export class TripList {
  protected readonly store = inject(TripStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly menuService = inject(MenuService);

  // inputs
  public listId = input('all');
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  // keepDefaultTrue: withComponentInputBinding() would otherwise set this to undefined on standalone
  public showMenuButton = input(true, { transform: keepDefaultTrue });

  // derived
  protected readonly popupId = computed(() => 'c_trips_' + this.listId());

  // the context menu doc carries its own roleNeeded; honour it instead of hard-coding kiosk/admin
  private readonly contextMenu = toSignal(toObservable(this.contextMenuName).pipe(
    switchMap(name => this.menuService.read(name))
  ));
  protected readonly canOpenContextMenu = computed(() =>
    !this.store.locked() && hasRole(this.contextMenu()?.roleNeeded, this.currentUser()));

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

  constructor() {
    // the listId (a `trip_type` category value, e.g. 'logbuch') partitions the list by trip type
    effect(() => this.store.setType(this.listId()));

    // A kiosk iPad sleeps for hours; iOS suspends the page and the Firestore listen stream can
    // come back dead (or has errored into the empty-list fallback), leaving the list frozen.
    // Rebuild it whenever the device wakes up. Cheap: one re-subscribe, not a page reload.
    document.addEventListener('visibilitychange', this.reloadOnWake);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', this.reloadOnWake));
  }

  private readonly reloadOnWake = (): void => {
    if (!document.hidden) this.store.tripsResource.reload();
  };

  /** Manual refresh (pull-to-refresh). Completes at once — the spinner is driven by store.isLoading(). */
  protected reload(event?: CustomEvent): void {
    this.store.tripsResource.reload();
    (event?.target as HTMLIonRefresherElement | null)?.complete();
  }

  /******************************* context menu *************************************** */
  protected getWeekdayI18n(date: string): string {
    return getWeekdayI18nKey(date, false);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.createTrip(); break;
      case 'reportDamage': await this.store.reportDamage(this.currentUser()); break;
      case 'reportBug': await this.store.reportBug(this.currentUser()); break;
      case 'callSupport': await this.store.callSupport(); break;
      case 'showBoatStatistics': await this.store.showBoatStatistics(); break;
      case 'showPersonStatistics': await this.store.showPersonStatistics(); break;
      case 'exportRaw': await this.store.export('raw'); break;
      // console.error, not error(): that helper stays silent unless isDebugMode is passed, which
      // turned a menu item whose url does not match any case here into a dead, unreported click.
      default: console.error(`TripList.onPopoverDismiss: no handler for menu url '${selectedMethod}'`);
    }
  }

  /******************************* actions *************************************** */

  /** Icon of the trip state, from the `trip_state` category. Compound states ('open.rev') use their base state. */
  protected stateIcon(state: string): string {
    return getCategoryIcon(this.states(), state.split('.')[0]);
  }

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
    // deleting is limited to 30 min after the trip was closed; admins may delete anytime
    if (canWrite && !isDeleted && isTripDeletable(trip, this.hasRole('admin'))) {
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
