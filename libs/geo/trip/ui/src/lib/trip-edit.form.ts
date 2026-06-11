import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonChip, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { AvatarInfo, CategoryItemModel, CategoryListModel, LocationModel, ResourceModel, RoleName, TripModel, UserModel } from '@bk2/shared-models';
import { NotesInput, NotesInputI18n, NumberInput, NumberInputI18n } from '@bk2/shared-ui';
import { debugFormModel, getDurationLabel, hasRole } from '@bk2/shared-util-core';
import { validateVestTree } from '@bk2/shared-util-angular';
import { DEFAULT_NOTES } from '@bk2/shared-constants';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { Avatars } from '@bk2/avatar-ui';
import { formatTripTime, TripI18n, tripValidationSuite } from '@bk2/trip-util';


@Component({
  selector: 'bk-trip-edit-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonItem, IonLabel, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonCard, IonCardContent, IonButton,
    NotesInput, Avatars, NumberInput
  ],
  styles: [`ion-thumbnail { width: 30px; height: 30px; }`],
  template: `
    <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().date() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ duration() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- boat -->
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().boat() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  @if(formData().resource; as boat) {
                    <ion-icon slot="start" src="{{ getIcon(boat) | svgIcon }}" />
                    <ion-label>{{ boat.name2 }}</ion-label>
                    <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearBoat()" />
                  } @else {
                    <ion-button (click)="boatSelectClicked.emit()">
                      <ion-icon slot="start" src="{{'boat' | svgIcon }}" />
                      {{ i18n().select_boat_add() }}
                    </ion-button>
                  }
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- location -->
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().location() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  @if(formData().locations.length > 0) {
                    <ion-label>{{ formData().locations[0]?.name2 }}</ion-label>
                    <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearLocation()" />
                  } @else if(formData().customLocationLabel) {
                    <ion-label>{{ formData().customLocationLabel }}</ion-label>
                    <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearLocation()" />
                  } @else {
                    <ion-button (click)="locationSelectClicked.emit()">
                      <ion-icon slot="start" src="{{'location' | svgIcon }}" />
                      {{ i18n().select_location_add() }}
                    </ion-button>
                  }
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- distance -->
            @if(formData().locations.length > 0 || formData().customLocationLabel) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="distanceI18n()" [value]="distance()" (valueChange)="onFieldChange('distance', $event)" [readOnly]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    @if (formData().distance === 0) {
                      <ion-chip color="warning">{{ i18n().warning_distance_zero() }}</ion-chip>
                    }
                    @if (formData().distance > 50) {
                      <ion-chip color="warning">{{ i18n().warning_distance_high() }}</ion-chip>
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- participants -->
      @if(currentUser(); as currentUser) {
        <bk-avatars (selectClicked)="personSelectClicked.emit()"
          [avatars]="participants()"
          (avatarsChange)="onFieldChange('participants', $event)"
          [readOnly]="false"
          [currentUser]="currentUser"
          [title]="i18n().select_participant_title()"
        />
      }

    @if(hasRole('admin')) {
      <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="false" />
    }
  `,
})
export class TripEditForm {
  // inputs
  public readonly i18n = input.required<TripI18n>();
  public readonly formData = model.required<TripModel>();
  protected readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly mode = input.required<'add' | 'edit' | 'end'>();
  public readonly boats = input.required<ResourceModel[]>();
  public readonly locations = input.required<LocationModel[]>();
  public readonly category = input.required<CategoryListModel>();

  // outputs
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public personSelectClicked = output<void>();
  public boatSelectClicked = output<void>();
  public locationSelectClicked = output<void>();

  // signal form — wraps formData with Vest validation
  protected readonly tripForm = form(this.formData, (path) =>
    validateVestTree(path, tripValidationSuite),
  );

  constructor() {
    effect(() => this.valid.emit(this.tripForm().valid()));
  }

  // derived
  protected duration = computed(() =>
    getDurationLabel(this.formData().startDate, this.formData().startTime, this.formData().endTime)
  );
  protected selectedLocationKey = computed(() => this.formData().locations?.[0] ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected participants = linkedSignal(() => this.formData()?.participants ?? []);
  protected distance = computed(() => this.formData().distance ?? 0);

  protected distanceI18n = computed(() => ({
    name: 'distance',
    label: this.i18n().distance_label(),
    placeholder: this.i18n().distance_placeholder(),
    helper: this.i18n().distance_helper()
  } as NumberInputI18n));

  // constants
  protected formatTime = formatTripTime;

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean | AvatarInfo | AvatarInfo[] | undefined): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormModel<TripModel>('TripEditForm', this.formData(), this.currentUser());
  }

  protected clearBoat(): void {
    this.onFieldChange('resource', undefined);
  }

  protected clearLocation(): void {
    this.onFieldChange('locations', []);
    this.onFieldChange('customLocationLabel', '');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected getIcon(boat: AvatarInfo): string {
    const itemName = boat.type === 'rboat' ? boat.subType : boat.type;
    return this.getCategoryItem(this.category(), itemName)?.icon ?? '';
  }

  getCategoryItem(cat: CategoryListModel, itemName?: string): CategoryItemModel | undefined {
    return cat ? cat.items.find(i => i.name === itemName) : undefined;
  }
}
