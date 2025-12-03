import { Component, computed, effect, input, model, output } from '@angular/core';
import { vestForms } from 'ngx-vest-forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { BaseProperty, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, ColorComponent, ErrorNoteComponent, NotesInputComponent, NumberInputComponent, PropertyListComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_CAR_TYPE, DEFAULT_GENDER, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PET_TYPE, DEFAULT_PRICE, DEFAULT_RBOAT_TYPE, DEFAULT_RBOAT_USAGE, DEFAULT_TAGS } from '@bk2/shared-constants';

import { RESOURCE_FORM_SHAPE, ResourceFormModel, resourceFormValidations } from '@bk2/resource-util';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-resource-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    ChipsComponent, NotesInputComponent, PropertyListComponent,
    TextInputComponent, NumberInputComponent, ErrorNoteComponent, CategorySelectComponent,
    ColorComponent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">
 
    @switch(formData().type) {
      <!-- ***************************************** ROWING BOAT ***************************************** -->
      @case('rboat') {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.rboat.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
                  <bk-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12">
                  <bk-cat-select [category]="subTypes()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('subType', $event)" />
                </ion-col>
                <ion-col size="12">
                  <bk-cat-select [category]="usages()!" [selectedItemName]="usage()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('usage', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="load" [value]="load()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('load', $event)" />
                  <bk-error-note [errors]="loadErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="currentValue" [value]="currentValue()" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('currentValue', $event)" />                                        
                  <bk-error-note [errors]="currentValueErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-color [hexColor]="hexColor()"  [readOnly]="isReadOnly()" (changed)="onFieldChange('hexColor', $event)" />
                  <bk-error-note [errors]="hexColorErrors()" />                                                                                  
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }

      <!-- *****************************************  BOAT ***************************************** -->
      @case('boat') {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.boat.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />                                        
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12">
                  <bk-cat-select [category]="subTypes()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('subType', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="load" [value]="load()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('load', $event)" />                                        
                  <bk-error-note [errors]="loadErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="currentValue" [value]="currentValue()" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('currentValue', $event)" />                                        
                  <bk-error-note [errors]="currentValueErrors()" />                                                                                                                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-color [hexColor]="hexColor()" [readOnly]="isReadOnly()" (changed)="onFieldChange('hexColor', $event)" />
                  <bk-error-note [errors]="hexColorErrors()" />                                                                                                                                                             
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>        
      }

      <!-- ***************************************** CAR ***************************************** -->
      @case('car') {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.car.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                                                       
                </ion-col>
                <ion-col size="12">
                  <bk-cat-select [category]="subTypes()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('subType', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input name="load" [value]="load()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('load', $event)" />
                  <bk-error-note [errors]="loadErrors()" />                                                                                                                                                                                                
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="currentValue" [value]="currentValue()" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('currentValue', $event)" />
                  <bk-error-note [errors]="currentValueErrors()" />                                                                                                                                                                                                    
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-color [hexColor]="hexColor()" [readOnly]="isReadOnly()" (changed)="onFieldChange('hexColor', $event)" />
                  <bk-error-note [errors]="hexColorErrors()" />                                                                                                                                                             
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>        
      }

      <!-- ***************************************** LOCKER ***************************************** -->
      @case('locker') {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.locker.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="lockerNr" [value]="lockerNr()" [maxLength]=3 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('lockerNr', $event)" />
                  <bk-error-note [errors]="lockerNrErrors()" />                                                                                                                                                                                                                                
                </ion-col>
        
                <ion-col size="12" size-md="6">
                  <bk-number-input name="keyNr" [value]="keyNr()" [maxLength]=5 [readOnly]="isReadOnly()" (changed)="onFieldChange('keyNr', $event)" />
                  <bk-error-note [errors]="keyNrErrors()" />                                                                                                                                                                                                                             
                </ion-col> 
                <ion-col size="12">
                  <bk-cat-select [category]="subTypes()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('subType', $event)" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>        
      }

      <!-- ***************************************** KEY ***************************************** -->
      @case('key') {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.key.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                <bk-text-input name="keyNr" [value]="name()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
                <bk-error-note [errors]="keyNrErrors()" />                                                                                                                                                                                                    
                </ion-col>        
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }

      <!-- ***************************************** PET ***************************************** -->
      @case('pet') {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.pet.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                                                                                          
                </ion-col>
               <ion-col size="12">
                  <bk-cat-select [category]="subTypes()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('subType', $event)" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-color [hexColor]="hexColor()" [readOnly]="isReadOnly()" (changed)="onFieldChange('hexColor', $event)" />
                  <bk-error-note [errors]="hexColorErrors()" />                                                                                                                                                             
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>        
      }

      <!-- ***************************************** REAL ESTATE ***************************************** -->
      @case('realestate') {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.realestate.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                                                                                          
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-number-input name="currentValue" [value]="currentValue()" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('currentValue', $event)" />
                  <bk-error-note [errors]="currentValueErrors()" />                                                                                                                                                                                                                                  
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>        
      }

      <!-- ***************************************** OTHER RESOURCE ***************************************** -->
      @default {
       <ion-card>
          <ion-card-header>
            <ion-card-title>{{ 'resource.type.default.formTitle' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row >
                <ion-col size="12">
                  <bk-text-input name="name" [value]="name()" [maxLength]=30 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
                  <bk-error-note [errors]="nameErrors()" />                                                                                                                                                    
                </ion-col>
                
                <ion-col size="12" size-md="6">
                  <bk-text-input name="load" [value]="load()" [maxLength]=20 [readOnly]="isReadOnly()" (changed)="onFieldChange('load', $event)" />
                  <bk-error-note [errors]="loadErrors()" />                                                                                                                                                                                                                                 
                </ion-col>
        
                <ion-col size="12" size-md="6">
                  <bk-number-input name="currentValue" [value]="currentValue()" [maxLength]=10 [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('currentValue', $event)" />
                  <bk-error-note [errors]="currentValueErrors()" />                                                                                                                                                                                                                                                                  
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-color [hexColor]="hexColor()" [readOnly]="isReadOnly()" (changed)="onFieldChange('hexColor', $event)" />
                  <bk-error-note [errors]="hexColorErrors()" />                                                                                                                                                             
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }
    }

    <bk-property-list [propertyList]="data()" name="resourceData" (changed)="onFieldChange('propertyList', $event)" />

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
    }
  
    @if(hasRole('admin')) {
      <bk-notes name="description" [value]="description()" [readOnly]="isReadOnly()" (changed)="onFieldChange('description', $event)" />
    }
</form>
  `
})
export class ResourceFormComponent {
  // inputs
  public formData = model.required<ResourceFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readonly subTypes = input<CategoryListModel | undefined>();
  public readonly usages = input<CategoryListModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = resourceFormValidations;
  protected readonly shape = RESOURCE_FORM_SHAPE;
  private readonly validationResult = computed(() => resourceFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected loadErrors = computed(() => this.validationResult().getErrors('load'));
  protected currentValueErrors = computed(() => this.validationResult().getErrors('currentValue'));
  protected hexColorErrors = computed(() => this.validationResult().getErrors('hexColor'));
  protected boatNameErrors = computed(() => this.validationResult().getErrors('boatName'));
  protected keyNrErrors = computed(() => this.validationResult().getErrors('keyNr'));
  protected lockerNrErrors = computed(() => this.validationResult().getErrors('lockerNr'));
  protected errors = computed(() => this.validationResult().getErrors());

  // fields
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected type = computed(() => this.formData().subType ?? this.getDefaultType(this.formData().type ?? ''));
  protected usage = computed(() => this.formData().usage ?? DEFAULT_RBOAT_USAGE);
  protected load = computed(() => this.formData().load ?? '');
  protected currentValue = computed(() => this.formData().currentValue ?? DEFAULT_PRICE);
  protected hexColor = computed(() => this.formData().hexColor ?? '');
  protected keyNr = computed(() => this.formData().keyNr ?? 0);
  protected lockerNr = computed(() => this.formData().lockerNr ?? 0);
  protected data = computed(() => this.formData().data ?? []);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected description = computed(() => this.formData().description ?? DEFAULT_NOTES);

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  private getDefaultType(type: string): string {
    switch (type) {
      case 'rboat': return DEFAULT_RBOAT_TYPE;
      case 'car':  return DEFAULT_CAR_TYPE;
      case 'locker': return DEFAULT_GENDER;
      case 'pet': return DEFAULT_PET_TYPE;
      // tbd: define other defaults: boat, realestate, locker,
      default: return DEFAULT_NAME;
    }
  } 

  protected onFormChange(value: ResourceFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('ResourceForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | BaseProperty[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('ResourceForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
