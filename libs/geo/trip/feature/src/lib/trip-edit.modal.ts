import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { DateFormat, debugFormModel, getCurrentTime, getTodayStr, safeStructuredClone } from '@bk2/shared-util-core';
import { AvatarInfo, ResourceModel, TripModel, UserModel } from '@bk2/shared-models';

import { TripEditForm } from '@bk2/trip-ui';
import { TripStore } from './trip.store';
import { getTripIndex, newTripName } from '@bk2/trip-util';
import { TripService } from '@bk2/trip-data-access';

@Component({
  selector: 'bk-trip-edit-modal',
  standalone: true,
  imports: [
    Header, TripEditForm, ChangeConfirmation,
    IonContent
  ],
  providers: [TripStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if (formData(); as formData) {
        <bk-trip-edit-form
          [formData]="formData" (formDataChange)="onTripChange($event)"
          [currentUser]="currentUser()"
          [tenantId]="tenantId()"
          [mode]="mode()"
          [boats]="boats()"
          [category]="category()"
          [locations]="store.locations()"
          [i18n]="store.i18n"
          (personSelectClicked)="addPerson()"
          (boatSelectClicked)="addBoat()"
          (locationSelectClicked)="addLocation()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class TripEditModal {
  private readonly modalController = inject(ModalController);
  private readonly tripService = inject(TripService);
  protected readonly store = inject(TripStore);

  // inputs
  public readonly trip = input.required<TripModel>();
  public readonly mode = input.required<'add' | 'edit' | 'end' | 'view'>();

  // signals
  // 'end' starts dirty so the change-confirmation toolbar shows immediately and the trip can be saved right away
  protected formDirty = linkedSignal(() => this.mode() === 'end');
  protected formValid = signal(false);

  // derived
  protected currentUser = computed(() => this.store.currentUser());
  protected tenantId = computed(() => this.store.tenantId());
  protected showConfirmation = computed(() => {
    return this.formValid() && this.formDirty() 
  });
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected boats = computed(() =>
    (this.store.appStore.allResources() ?? []).filter((r: ResourceModel) => r.type === 'rboat')
  );
  protected category = computed(() => this.store.appStore.getCategory('rboat_type'));
  public formData = linkedSignal(() => safeStructuredClone(this.trip()));

  protected headerTitle = computed(() => {
    switch (this.mode()) {
      case 'add':  return this.store.i18n.create();
      case 'edit': return this.store.i18n.update();
      case 'end':  return this.store.i18n.end();
      case 'view': return this.store.i18n.view();
    }
  });

  /******************************* actions *************************************** */

  protected onTripChange(trip: TripModel): void {
    this.formData.set(trip);
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.trip()));
  }

  public async save(): Promise<void> {
    const trip = this.formData();
    if (!trip) return;
    trip.name = newTripName(trip);
    trip.index = getTripIndex(trip);

    switch (this.mode()) {
      case 'add':
        trip.state = 'open';
        await this.tripService.create(trip, this.store.currentUser());
        break;
      case 'edit':
        await this.tripService.update(trip, this.store.currentUser());
        break;
      case 'end':
        trip.endDate = getTodayStr(DateFormat.StoreDate);
        trip.endTime = getCurrentTime();        
        trip.state = 'closed';
        await this.tripService.update(trip, this.store.currentUser());
        break;
    }

    if (this.mode() === 'add' || this.mode() === 'edit') {
      const reasons = this.store.checkSuspiciousActivity(trip);
      if (reasons.length > 0) {
        await this.store.recordSuspiciousActivity(trip, reasons);
      }
    }

    await this.modalController.dismiss(null, 'confirm');
  }

  protected async addPerson(): Promise<void> {
    const person = await this.store.selectPersonAvatar();
    if (!person) return;
    const participants = this.formData()?.participants;
    if (!participants) return;
    participants.push(person);
    this.onFieldChange('participants', participants);
  }

  protected async addBoat(): Promise<void> {
    const boat = await this.store.selectResourceAvatar();
    if (!boat) return;
    this.onFieldChange('resource', boat);
  }

  protected async addLocation(): Promise<void> {
    const result = await this.store.selectLocationForTrip();
    if (!result) return;
    if (result.kind === 'predefined') {
      const locations = this.formData()?.locations;
      if (!locations) return;
      const locationAvatar: AvatarInfo = {
        key: result.location.bkey,
        name1: result.location.distance + '',
        name2: result.location.name,
        label: '',
        modelType: 'location',
        type: result.location.type,
        subType: '',
      };
      locations.push(locationAvatar);
      this.onFieldChange('locations', locations);
      this.onFieldChange('distance', result.location.distance);
      this.onFieldChange('customLocationLabel', '');
    } else {
      this.onFieldChange('customLocationLabel', result.label);
      this.onFieldChange('locations', []);
      this.onFieldChange('distance', 0);
    }
  }

  private onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean | AvatarInfo | AvatarInfo[]): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue } as TripModel));
    debugFormModel<TripModel>('TripEditModal', this.formData()!, this.currentUser());
  }
}
