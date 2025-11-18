import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CaseInsensitiveWordMask, LatitudeMask, LongitudeMask, What3WordMask } from '@bk2/shared-config';
import { CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { LocationFormModel, locationFormModelShape, locationFormValidations } from '@bk2/location-util';

@Component({
  selector: 'bk-location-form',
  standalone: true,
  imports: [
    vestForms,
    CategorySelectComponent, TextInputComponent, NumberInputComponent, ChipsComponent, 
    NotesInputComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <ion-grid>
      <!---------------------------------------------------
        Latitude, Longitude, PlaceId, What3Words, Height, Speed, Direction 
        --------------------------------------------------->
      <ion-row>
        <ion-col size="12" size-md="6">
          <bk-text-input name="name" [value]="name()" [autofocus]="true" [copyable]="true" [readOnly]="readOnly()" (changed)="onChange('name', $event)" />  
          <bk-error-note [errors]="nameErrors()" />                                                                                                                     
        </ion-col>
        <ion-col size="12" size-md="6">
          <bk-cat-select [category]="types()!" selectedItemName="locationType()" [readOnly]="readOnly()" [withAll]=false (changed)="onChange('locationType', $event)" />
        </ion-col>
        <ion-col size="12" size-md="6">
          <bk-text-input name="latitude" [value]="latitude()" [mask]="latitudeMask" [readOnly]="readOnly()" (changed)="onChange('latitude', $event)" />                                        
        </ion-col>
        <ion-col size="12" size-md="6">
          <bk-text-input name="longitude" [value]="longitude()" [mask]="longitudeMask" [readOnly]="readOnly()" (changed)="onChange('longitude', $event)" />                                        
        </ion-col>
        <ion-col size="12" size-md="6">
          <bk-text-input name="placeId" [value]="placeId()" [copyable]="true" [mask]="caseInsensitiveWordMask" [readOnly]="readOnly()" [showHelper]=true (changed)="onChange('placeId', $event)" />                                        
        </ion-col>
        <ion-col size="12" size-md="6">
        <bk-text-input name="what3words" [value]="what3words()" [copyable]="true" [mask]="what3wordMask" [readOnly]="readOnly()" [showHelper]=true (changed)="onChange('what3words', $event)" />                                        
        </ion-col>
        <ion-col size="12" size-md="6">
          <bk-number-input name="seaLevel" [value]="seaLevel()" [maxLength]=4 [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('seaLevel', $event)" />                                        
        </ion-col>
        <ion-col size="12" size-md="6">
          <bk-number-input name="speed" [value]="speed()" [maxLength]=5 [showHelper]=true [readOnly]="readOnly()" (changed)="onChange('speed', $event)" />                                        
        </ion-col>
        <ion-col size="12" size-md="6">
          <bk-number-input name="direction" [value]="direction()" [maxLength]=4 [readOnly]="readOnly()" [showHelper]=true (changed)="onChange('direction', $event)" />                                        
        </ion-col>
      </ion-row>

      <!---------------------------------------------------
        TAG, NOTES 
        --------------------------------------------------->
      @if(hasRole('privileged')) {
        <ion-row> 
          <ion-col>
            <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
          </ion-col>
        </ion-row>
      }

      @if(hasRole('admin')) {
        <ion-row> 
          <ion-col>
            <bk-notes [value]="notes()" [readOnly]="readOnly()" (changed)="onChange('notes', $event)" />
          </ion-col>
        </ion-row>    
      }
    </ion-grid>
  </form>
`
})
export class LocationFormComponent {
  protected modalController = inject(ModalController);
  public vm = model.required<LocationFormModel>();
  public currentUser = input<UserModel | undefined>();
  public types = input.required<CategoryListModel>();
  public allTags = input.required<string>();
  public readonly readOnly = input(true);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected name = computed(() => this.vm().name ?? '');
  protected locationType = computed(() => this.vm().type ?? 'geomarker');
  protected latitude = computed(() => this.vm().latitude + '');
  protected longitude = computed(() => this.vm().longitude + '');
  protected placeId = computed(() => this.vm().placeId ?? '');
  protected what3words = computed(() => this.vm().what3words ?? '');
  protected seaLevel = computed(() => this.vm().seaLevel ?? 0);
  protected speed = computed(() => this.vm().speed ?? 0);
  protected direction = computed(() => this.vm().direction ?? 0);
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  
  protected readonly suite = locationFormValidations;
  protected shape = locationFormModelShape;
  private readonly validationResult = computed(() => locationFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  protected what3wordMask = What3WordMask;
  protected longitudeMask = LongitudeMask;
  protected latitudeMask = LatitudeMask;
  protected caseInsensitiveWordMask = CaseInsensitiveWordMask;

  protected onValueChange(value: LocationFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    if (fieldName === 'longitude' || fieldName === 'latitude') {
      this.vm.update((vm) => ({ ...vm, type: $event + '' }));
    } else {
      this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    }
    debugFormErrors('LocationForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}