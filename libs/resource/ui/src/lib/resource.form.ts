import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BaseProperty, CategoryListModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChipsComponent, NotesInputComponent, PropertyListComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { ResourceFormModel, resourceFormShape, resourceFormValidations } from '@bk2/resource-util';

import { BoatComponent } from './boat.component';
import { CarComponent } from './car.component';
import { KeyComponent } from './key.component';
import { LockerComponent } from './locker.component';
import { OtherResourceComponent } from './other-resource.component';
import { RealEstateComponent } from './real-estate.component';
import { RowingBoatComponent } from "./rowing-boat.component";
import { DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_RBOAT_USAGE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS } from '@bk2/shared-constants';

@Component({
  selector: 'bk-resource-form',
  standalone: true,
  imports: [
    vestForms,
    ChipsComponent, NotesInputComponent,
    PropertyListComponent, RowingBoatComponent, BoatComponent, CarComponent, LockerComponent, 
    KeyComponent, RealEstateComponent, OtherResourceComponent
],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
 
    @switch(vm().type) {
      @case('rboat') {
        <bk-rowing-boat [vm]="vm()" [readOnly]="readOnly()" [subTypes]="subTypes()" [usages]="usages()" />
      }
      @case('boat') {
        <bk-boat [vm]="vm()" [readOnly]="readOnly()" [subTypes]="subTypes()" />
      }
      @case('car') {
        <bk-car [vm]="vm()" [readOnly]="readOnly()" [subTypes]="subTypes()" />
      }
      @case('locker') {
        <bk-locker [vm]="vm()" [readOnly]="readOnly()" [subTypes]="subTypes()" />
      }
      @case('key') {
        <bk-key [vm]="vm()" [readOnly]="readOnly()" />
      }
      @case('realestate') {
        <bk-real-estate [vm]="vm()" [readOnly]="readOnly()" />
      }
      @default {
        <bk-other-resource [vm]="vm()" [readOnly]="readOnly()" />
      }
    }

    <bk-property-list [propertyList]="data()" name="resourceData" (changed)="onChange('propertyList', $event)" />

    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="readOnly()" (changed)="onChange('tags', $event)" />
    }
  
    @if(hasRole('admin')) {
      <bk-notes name="description" [value]="description()" [readOnly]="readOnly()" (changed)="onChange('description', $event)" />
    }
</form>
  `
})
export class ResourceFormComponent {
  public vm = model.required<ResourceFormModel>();
  public currentUser = input<UserModel | undefined>();
  public allTags = input.required<string>();
  public types = input<CategoryListModel | undefined>();
  public subTypes = input<CategoryListModel | undefined>();
  public usages = input<CategoryListModel | undefined>();
  public readOnly = input(true);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected isNew = computed(() => this.vm().bkey === undefined || this.vm().bkey === '');
  protected typeName = computed(() => this.vm().type ?? DEFAULT_RESOURCE_TYPE);
  protected name = computed(() => this.vm().name ?? DEFAULT_NAME);
  protected usage = computed(() => this.vm().usage ?? DEFAULT_RBOAT_USAGE);
  protected load = computed(() => this.vm().load ?? '');
  protected currentValue = computed(() => this.vm().currentValue ?? DEFAULT_PRICE);
  protected hexColor = computed(() => this.vm().hexColor ?? '');
  protected keyNr = computed(() => this.vm().keyNr ?? 0);
  protected lockerNr = computed(() => this.vm().lockerNr ?? 0);
  protected data = computed(() => this.vm().data ?? []);
  protected tags = computed(() => this.vm().tags ?? DEFAULT_TAGS);
  protected description = computed(() => this.vm().description ?? DEFAULT_NOTES);

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
