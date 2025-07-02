import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BaseProperty, ResourceType, RowingBoatUsage, UserModel, RoleName } from '@bk2/shared/models';
import { debugFormErrors, hasRole } from '@bk2/shared/util-core';
import { CategoryComponent, ChipsComponent, NotesInputComponent, PropertyListComponent } from '@bk2/shared/ui';
import { ResourceFormModel, resourceFormShape, resourceFormValidations } from '@bk2/resource/util';
import { ResourceTypes } from '@bk2/shared/categories';
import { RowingBoatComponent } from "./rowing-boat.component";
import { BoatComponent } from './boat.component';
import { CarComponent } from './car.component';
import { LockerComponent } from './locker.component';
import { KeyComponent } from './key.component';
import { RealEstateComponent } from './real-estate.component';
import { OtherResourceComponent } from './other-resource.component';

@Component({
  selector: 'bk-resource-form',
  imports: [
    vestForms,
    CategoryComponent, ChipsComponent, NotesInputComponent,
    PropertyListComponent, RowingBoatComponent, BoatComponent, CarComponent, LockerComponent, 
    KeyComponent, RealEstateComponent, OtherResourceComponent,
    IonGrid, IonRow, IonCol
],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
 
    @if(isTypeEditable() === true) {
      <ion-grid>
        <ion-row>
          <ion-col size="12" size-md="6">
            <bk-cat name="type" [value]="type()" [categories]="resourceTypes" (changed)="onChange('type', $event)" [readOnly]="readOnly()" />
          </ion-col>
        </ion-row>
      </ion-grid>
    }
    @switch(vm().type) {
      @case(resourceType.RowingBoat) {
        <bk-rowing-boat [vm]="vm()" [currentUser]="currentUser()" />
      }
      @case(resourceType.Boat) {
        <bk-boat [vm]="vm()" [currentUser]="currentUser()" />
      }
      @case(resourceType.Car) {
        <bk-car [vm]="vm()" [currentUser]="currentUser()" />
      }
      @case(resourceType.Locker) {
        <bk-locker [vm]="vm()" [currentUser]="currentUser()" />
      }
      @case(resourceType.Key) {
        <bk-key [vm]="vm()" [currentUser]="currentUser()" />
      }
      @case(resourceType.RealEstate) {
        <bk-real-estate [vm]="vm()" [currentUser]="currentUser()" />
      }
      @default {
        <bk-other-resource [vm]="vm()" [currentUser]="currentUser()" />
      }
    }

    <bk-property-list [propertyList]="data()" name="resourceData" (changed)="onChange('propertyList', $event)" />

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="resourceTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }
  
    @if(hasRole('admin')) {
      <bk-notes name="description" [value]="description()" (changed)="onChange('description', $event)" />
    }
</form>
  `
})
export class ResourceFormComponent {
  public vm = model.required<ResourceFormModel>();
  public isTypeEditable = input(false);
  public resourceTags = input.required<string>();
  public currentUser = input<UserModel | undefined>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  public readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected isNew = computed(() => this.vm().bkey === undefined || this.vm().bkey === '');
  protected type = computed(() => this.vm().type ?? ResourceType.Other);
  protected name = computed(() => this.vm().name ?? '');
  protected usage = computed(() => this.vm().usage ?? RowingBoatUsage.Breitensport);
  protected load = computed(() => this.vm().load ?? '');
  protected currentValue = computed(() => this.vm().currentValue ?? 0);
  protected hexColor = computed(() => this.vm().hexColor ?? '');
  protected keyNr = computed(() => this.vm().keyNr ?? 0);
  protected lockerNr = computed(() => this.vm().lockerNr ?? 0);
  protected data = computed(() => this.vm().data ?? []);
  protected tags = computed(() => this.vm().tags ?? '');
  protected description = computed(() => this.vm().description ?? '');

  protected readonly suite = resourceFormValidations;
  protected readonly shape = resourceFormShape;
  private readonly validationResult = computed(() => resourceFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected loadErrors = computed(() => this.validationResult().getErrors('load'));
  protected currentValueErrors = computed(() => this.validationResult().getErrors('currentValue'));
  protected hexColorErrors = computed(() => this.validationResult().getErrors('hexColor'));
  protected boatNameErrors = computed(() => this.validationResult().getErrors('boatName'));
  protected keyNrErrors = computed(() => this.validationResult().getErrors('keyNr'));
  protected lockerNrErrors = computed(() => this.validationResult().getErrors('lockerNr'));
  protected errors = computed(() => this.validationResult().getErrors());

  protected resourceType = ResourceType;
  protected resourceTypes = ResourceTypes;

  protected onValueChange(value: ResourceFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | BaseProperty[]): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ResourceForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
