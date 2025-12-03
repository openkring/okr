import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CaseInsensitiveWordMask, LatitudeMask, LongitudeMask, What3WordMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { LocationFormModel, locationFormModelShape, locationFormValidations } from '@bk2/location-util';

@Component({
  selector: 'bk-location-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, TextInputComponent, NumberInputComponent, ChipsComponent, 
    NotesInputComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <!---------------------------------------------------
            Latitude, Longitude, PlaceId, What3Words, Height, Speed, Direction 
            --------------------------------------------------->
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-text-input name="name" [value]="name()" [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />  
              <bk-error-note [errors]="nameErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" selectedItemName="locationType()" [readOnly]="isReadOnly()" [withAll]=false (changed)="onFieldChange('locationType', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input name="latitude" [value]="latitude()" [mask]="latitudeMask" [readOnly]="isReadOnly()" (changed)="onFieldChange('latitude', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input name="longitude" [value]="longitude()" [mask]="longitudeMask" [readOnly]="isReadOnly()" (changed)="onFieldChange('longitude', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input name="placeId" [value]="placeId()" [copyable]="true" [mask]="caseInsensitiveWordMask" [readOnly]="isReadOnly()" [showHelper]=true (changed)="onFieldChange('placeId', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
            <bk-text-input name="what3words" [value]="what3words()" [copyable]="true" [mask]="what3wordMask" [readOnly]="isReadOnly()" [showHelper]=true (changed)="onFieldChange('what3words', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input name="seaLevel" [value]="seaLevel()" [maxLength]=4 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('seaLevel', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input name="speed" [value]="speed()" [maxLength]=5 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('speed', $event)" />                                        
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input name="direction" [value]="direction()" [maxLength]=4 [readOnly]="isReadOnly()" [showHelper]=true (changed)="onFieldChange('direction', $event)" />                                        
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <!---------------------------------------------------
      TAG, NOTES 
      --------------------------------------------------->
    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    }

    @if(hasRole('admin')) {
      <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
    }
  </form>
`
})
export class LocationFormComponent {
  protected modalController = inject(ModalController);

  // inputs
  public formData = model.required<LocationFormModel>();
  public currentUser = input<UserModel | undefined>();
  public types = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = locationFormValidations;
  protected shape = locationFormModelShape;
  private readonly validationResult = computed(() => locationFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected name = computed(() => this.formData().name ?? '');
  protected locationType = computed(() => this.formData().type ?? 'geomarker');
  protected latitude = computed(() => this.formData().latitude + '');
  protected longitude = computed(() => this.formData().longitude + '');
  protected placeId = computed(() => this.formData().placeId ?? '');
  protected what3words = computed(() => this.formData().what3words ?? '');
  protected seaLevel = computed(() => this.formData().seaLevel ?? 0);
  protected speed = computed(() => this.formData().speed ?? 0);
  protected direction = computed(() => this.formData().direction ?? 0);
  protected tags = computed(() => this.formData().tags ?? '');
  protected notes = computed(() => this.formData().notes ?? '');
  
  // passing constants to template
  protected what3wordMask = What3WordMask;
  protected longitudeMask = LongitudeMask;
  protected latitudeMask = LatitudeMask;
  protected caseInsensitiveWordMask = CaseInsensitiveWordMask;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: LocationFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('LocationForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    if (fieldName === 'longitude' || fieldName === 'latitude') {
      this.formData.update((vm) => ({ ...vm, type: fieldValue + '' }));
    } else {
      this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    }
    debugFormErrors('LocationForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}