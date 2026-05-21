import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CaseInsensitiveWordMask, LatitudeMask, LongitudeMask, What3WordMask } from '@bk2/shared-config';
import { CategoryListModel, LocationModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { locationValidations } from '@bk2/location-util';
import { PFX } from './scope';

@Component({
  selector: 'bk-location-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelect, TextInput, NumberInput, Chips, NotesInput, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
        (formValueChange)="onFormChange($event)">

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if(hasRole('admin')) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <!---------------------------------------------------
                Latitude, Longitude, PlaceId, What3Words, Height, Speed, Direction
                --------------------------------------------------->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="types()!" [selectedItemName]="locationType()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isReadOnly()" [withAll]=false />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="latitudeI18n()" [value]="latitude()" (valueChange)="onFieldChange('latitude', $event)" [mask]="latitudeMask" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="longitudeI18n()" [value]="longitude()" (valueChange)="onFieldChange('longitude', $event)" [mask]="longitudeMask" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="placeIdI18n()" [value]="placeId()" (valueChange)="onFieldChange('placeId', $event)" [copyable]="true" [mask]="caseInsensitiveWordMask" [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="what3wordsI18n()" [value]="what3words()" (valueChange)="onFieldChange('what3words', $event)" [copyable]="true" [mask]="what3wordMask" [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="seaLevelI18n()" [value]="seaLevel()" [maxLength]=4 [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="speedI18n()" [value]="speed()" [maxLength]=5 [showHelper]=true [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="directionI18n()" [value]="direction()" (valueChange)="onFieldChange('direction', $event)" [maxLength]=4 [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="distanceI18n()" [value]="distance()" (valueChange)="onFieldChange('distance', $event)" [maxLength]=6 [readOnly]="isReadOnly()" [showHelper]=true />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!---------------------------------------------------
          TAG, NOTES
          --------------------------------------------------->
        @if(hasRole('privileged')) {
          <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }

        @if(hasRole('admin')) {
          <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
`
})
export class LocationForm {
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly formData = model.required<LocationModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly types = input.required<CategoryListModel>();
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = locationValidations;
  private readonly validationResult = computed(() => locationValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected locationType = linkedSignal(() => this.formData().type ?? 'geomarker');
  protected latitude = linkedSignal(() => this.formData().latitude + '');
  protected longitude = linkedSignal(() => this.formData().longitude + '');
  protected placeId = linkedSignal(() => this.formData().placeId ?? '');
  protected what3words = linkedSignal(() => this.formData().what3words ?? '');
  protected seaLevel = linkedSignal(() => this.formData().seaLevel ?? 0);
  protected speed = linkedSignal(() => this.formData().speed ?? 0);
  protected direction = linkedSignal(() => this.formData().direction ?? 0);
  protected distance = linkedSignal(() => this.formData().distance ?? 0);
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');

  // passing constants to template
  protected what3wordMask = What3WordMask;
  protected longitudeMask = LongitudeMask;
  protected latitudeMask = LatitudeMask;
  protected caseInsensitiveWordMask = CaseInsensitiveWordMask;

  // i18n
  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label:           PFX + 'bkey.label',
    bkey_placeholder:     PFX + 'bkey.placeholder',
    bkey_helper:          PFX + 'bkey.helper',
    name_label:           PFX + 'name.label',
    name_placeholder:     PFX + 'name.placeholder',
    name_helper:          PFX + 'name.helper',
    latitude_label:       PFX + 'latitude.label',
    latitude_placeholder: PFX + 'latitude.placeholder',
    latitude_helper:      PFX + 'latitude.helper',
    longitude_label:       PFX + 'longitude.label',
    longitude_placeholder: PFX + 'longitude.placeholder',
    longitude_helper:      PFX + 'longitude.helper',
    placeId_label:        PFX + 'placeId.label',
    placeId_placeholder:  PFX + 'placeId.placeholder',
    placeId_helper:       PFX + 'placeId.helper',
    what3words_label:       PFX + 'what3words.label',
    what3words_placeholder: PFX + 'what3words.placeholder',
    what3words_helper:      PFX + 'what3words.helper',
    seaLevel_label:         PFX + 'seaLevel.label',
    seaLevel_placeholder:   PFX + 'seaLevel.placeholder',
    seaLevel_helper:        PFX + 'seaLevel.helper',
    speed_label:            PFX + 'speed.label',
    speed_placeholder:      PFX + 'speed.placeholder',
    speed_helper:           PFX + 'speed.helper',
    direction_label:        PFX + 'direction.label',
    direction_placeholder:  PFX + 'direction.placeholder',
    direction_helper:       PFX + 'direction.helper',
    distance_label:         PFX + 'distance.label',
    distance_placeholder:   PFX + 'distance.placeholder',
    distance_helper:        PFX + 'distance.helper',
    notes_label:            PFX + 'notes.label',
    notes_placeholder:      PFX + 'notes.placeholder',
  });

  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.fieldI18n.bkey_label(),
    placeholder: this.fieldI18n.bkey_placeholder(),
    helper: this.fieldI18n.bkey_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.fieldI18n.name_label(),
    placeholder: this.fieldI18n.name_placeholder(),
    helper: this.fieldI18n.name_helper()
  } as TextInputI18n));

  protected latitudeI18n = computed(() => ({
    name: 'latitude',
    label: this.fieldI18n.latitude_label(),
    placeholder: this.fieldI18n.latitude_placeholder(),
    helper: this.fieldI18n.latitude_helper()
  } as TextInputI18n));

  protected longitudeI18n = computed(() => ({
    name: 'longitude',
    label: this.fieldI18n.longitude_label(),
    placeholder: this.fieldI18n.longitude_placeholder(),
    helper: this.fieldI18n.longitude_helper()
  } as TextInputI18n));

  protected placeIdI18n = computed(() => ({
    name: 'placeId',
    label: this.fieldI18n.placeId_label(),
    placeholder: this.fieldI18n.placeId_placeholder(),
    helper: this.fieldI18n.placeId_helper()
  } as TextInputI18n));

  protected what3wordsI18n = computed(() => ({
    name: 'what3words',
    label: this.fieldI18n.what3words_label(),
    placeholder: this.fieldI18n.what3words_placeholder(),
    helper: this.fieldI18n.what3words_helper()
  } as TextInputI18n));

  protected seaLevelI18n = computed(() => ({
    name: 'seaLevel',
    label: this.fieldI18n.seaLevel_label(),
    placeholder: this.fieldI18n.seaLevel_placeholder(),
    helper: this.fieldI18n.seaLevel_helper()
  } as NumberInputI18n));

  protected speedI18n = computed(() => ({
    name: 'speed',
    label: this.fieldI18n.speed_label(),
    placeholder: this.fieldI18n.speed_placeholder(),
    helper: this.fieldI18n.speed_helper()
  } as NumberInputI18n));

  protected directionI18n = computed(() => ({
    name: 'direction',
    label: this.fieldI18n.direction_label(),
    placeholder: this.fieldI18n.direction_placeholder(),
    helper: this.fieldI18n.direction_helper()
  } as NumberInputI18n));

  protected distanceI18n = computed(() => ({
    name: 'distance',
    label: this.fieldI18n.distance_label(),
    placeholder: this.fieldI18n.distance_placeholder(),
    helper: this.fieldI18n.distance_helper()
  } as NumberInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.fieldI18n.notes_label(),
    placeholder: this.fieldI18n.notes_placeholder()
  } as NotesInputI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    if (fieldName === 'what3words') {
      let value = fieldValue as string;
      if (value.startsWith('///')) {
        fieldValue = value.substring(3); // strip the leading ///
      }
    }
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: LocationModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('LocationForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('LocationForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
