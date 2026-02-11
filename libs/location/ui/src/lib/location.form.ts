import { Component, computed, effect, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CaseInsensitiveWordMask, LatitudeMask, LongitudeMask, What3WordMask } from '@bk2/shared-config';
import { CategoryListModel, LocationModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { locationValidations } from '@bk2/location-util';

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
                    <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <!---------------------------------------------------
                Latitude, Longitude, PlaceId, What3Words, Height, Speed, Direction 
                --------------------------------------------------->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" />  
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                     
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="types()!" [selectedItemName]="locationType()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isReadOnly()" [withAll]=false />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="latitude" [value]="latitude()" (valueChange)="onFieldChange('latitude', $event)" [mask]="latitudeMask" [readOnly]="isReadOnly()" />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="longitude" [value]="longitude()" (valueChange)="onFieldChange('longitude', $event)" [mask]="longitudeMask" [readOnly]="isReadOnly()" />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="placeId" [value]="placeId()" (valueChange)="onFieldChange('placeId', $event)" [copyable]="true" [mask]="caseInsensitiveWordMask" [readOnly]="isReadOnly()" [showHelper]=true />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                <bk-text-input name="what3words" [value]="what3words()" (valueChange)="onFieldChange('what3words', $event)" [copyable]="true" [mask]="what3wordMask" [readOnly]="isReadOnly()" [showHelper]=true />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="seaLevel" [value]="seaLevel()" [maxLength]=4 [showHelper]=true [readOnly]="isReadOnly()" />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="speed" [value]="speed()" [maxLength]=5 [showHelper]=true [readOnly]="isReadOnly()" />                                        
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="direction" [value]="direction()" (valueChange)="onFieldChange('direction', $event)" [maxLength]=4 [readOnly]="isReadOnly()" [showHelper]=true />                                        
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
          <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
`
})
export class LocationFormComponent {
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
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected bkey = computed(() => this.formData().bkey ?? '');
  
  // passing constants to template
  protected what3wordMask = What3WordMask;
  protected longitudeMask = LongitudeMask;
  protected latitudeMask = LatitudeMask;
  protected caseInsensitiveWordMask = CaseInsensitiveWordMask;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
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