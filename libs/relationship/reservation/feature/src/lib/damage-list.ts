import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';

import { TranslatePipe } from '@okr/shared-i18n';
import { ReservationModel, RoleName } from '@okr/shared-models';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { error, exportCsv, getExportFileName, showToast } from '@okr/shared-util-angular';
import { buildExportTable, getAvatarName, getCategoryIcon, getItemLabel, getYear, getYearList, hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { filterDamages, getDamageExportColumns, getDamageKindLabel, getLockedDays, isOpenLock } from '@okr/relationship-reservation-util';

import { ReservationStore } from './reservation.store';

/**
 * Schadensliste: every damage and lock of a rowing boat, read from the reservations
 * ('maintenance' / 'blocked' / 'damage', see damage-list.ts in reservation-util). Filtered by
 * year and boat type, exportable as CSV. The internal notes (who caused it, repair, cost,
 * insurance) are edited in the reservation modal, which this list opens.
 * For privileged / resourceAdmin only (route guard + menu).
 */
@Component({
  selector: 'okr-damage-list',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, PrettyDatePipe,
    Menu, ListFilter, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover, IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ReservationStore],
  styles: [`
    /* an open lock: the boat is out of service right now */
    ion-icon.locked { background: var(--ion-color-danger); color: var(--ion-color-danger-contrast); border-radius: 50%; padding: 4px; }
  `],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ damages().length }} {{ store.i18n.damage_title() }}</ion-title>
      <ion-buttons slot="end">
        <ion-button id="c_damages">
          <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
        </ion-button>
        <ion-popover trigger="c_damages" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
          <ng-template>
            <ion-content>
              <okr-menu [menuName]="contextMenuName()"/>
            </ion-content>
          </ng-template>
        </ion-popover>
      </ion-buttons>
    </ion-toolbar>

    <okr-list-filter
      (yearChanged)="selectedYear.set($event)" [years]="years()"
      (typeChanged)="selectedBoatType.set($event)" [types]="boatTypes()"
    />

    <ion-toolbar color="primary" class="ion-hide-md-down">
      <ion-item color="primary" lines="none">
        <ion-label><strong>{{ store.i18n.damage_boat() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.damage_kind() }}</strong></ion-label>
        <ion-label><strong>{{ store.i18n.damage_from() }} – {{ store.i18n.damage_to() }}</strong></ion-label>
        <ion-label class="ion-hide-lg-down"><strong>{{ store.i18n.damage_reason() }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      @if(damages().length === 0) {
        <okr-empty-list [message]="store.i18n.damage_empty()" />
      } @else {
        <ion-list lines="inset">
          @for(damage of damages(); track damage.okey) {
            <ion-item class="ion-text-wrap" (click)="edit(damage)">
              <ion-icon slot="start" src="{{ boatIcon(damage) | svgIcon }}" [class.locked]="isOpenLock(damage)" />
              <ion-label>
                {{ boatName(damage) }}
                <p>{{ boatTypeLabel(damage) | translate | async }}</p>
              </ion-label>
              <ion-label>{{ kindLabel(damage) }}</ion-label>
              <ion-label>
                {{ damage.startDate | prettyDate }}
                @if(isOpenLock(damage)) { – {{ store.i18n.damage_open() }} }
                @else if(damage.endDate !== damage.startDate) { – {{ damage.endDate | prettyDate }} }
                @if(lockedDays(damage) > 0) { <p>{{ lockedDays(damage) }} {{ store.i18n.damage_days() }}</p> }
              </ion-label>
              <ion-label class="ion-hide-lg-down">{{ damage.description }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
  `
})
export class DamageList {
  protected readonly store = inject(ReservationStore);

  // inputs
  public contextMenuName = input.required<string>();

  // filters — local, the store's year/reason filters belong to the reservation list
  protected readonly selectedYear = signal(getYear());
  protected readonly selectedBoatType = signal('all');

  // data
  protected readonly damages = computed(() => filterDamages(this.store.allReservations(), this.selectedYear(), this.selectedBoatType()));
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly years = computed(() => getYearList(getYear() + 1, 7));
  protected readonly boatTypes = computed(() => this.store.appStore.tryGetCategory('rboat_type'));
  private readonly currentUser = computed(() => this.store.currentUser());
  /** the notes are written by the same group that may lock a boat */
  protected readonly readOnly = computed(() => !this.hasRole('privileged') && !this.hasRole('resourceAdmin'));

  /******************************** getters ******************************************* */
  protected boatName(damage: ReservationModel): string {
    return getAvatarName(damage.resource);
  }

  /** i18n key of an rboat_type item — data-driven, so it goes through TranslatePipe, not the store. */
  protected boatTypeLabel(damage: ReservationModel): string {
    const subType = damage.resource?.subType ?? '';
    const category = this.boatTypes();
    return category ? getItemLabel(category, subType) : subType;
  }

  protected boatIcon(damage: ReservationModel): string {
    return getCategoryIcon(this.boatTypes(), damage.resource?.subType ?? '');
  }

  protected kindLabel(damage: ReservationModel): string {
    return getDamageKindLabel(damage, this.store.i18n);
  }

  protected lockedDays(damage: ReservationModel): number {
    return getLockedDays(damage);
  }

  protected isOpenLock(damage: ReservationModel): boolean {
    return isOpenLock(damage);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'exportRaw': await this.export(); break;
      default: error(undefined, `DamageList.call: unknown method ${selectedMethod}`);
    }
  }

  /** Opens the reservation modal — that is where the internal notes are kept. */
  protected async edit(damage: ReservationModel): Promise<void> {
    await this.store.edit(damage, this.readOnly());
  }

  /** CSV of the rows currently shown (year + boat type filter applied), internal notes included. */
  protected async export(): Promise<void> {
    const damages = this.damages();
    if (damages.length === 0) {
      showToast(this.store.toastController, this.store.i18n.export_empty());
      return;
    }
    // category item labels are i18n keys — resolved before the synchronous cell accessors run
    const boatType = await this.store.i18nService.createLabelResolver(this.boatTypes());
    const columns = getDamageExportColumns(this.store.i18n, boatType);
    await exportCsv(buildExportTable(damages, columns), getExportFileName('schadensliste', 'csv'));
    showToast(this.store.toastController, this.store.i18n.export_conf());
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
