import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ResourceModel, ResourceModelName, RoleName } from '@bk2/shared-models';
import { CategorySelect, ChangeConfirmation, ChangeConfirmationI18n, Header, IconToolbar } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, safeStructuredClone } from '@bk2/shared-util-core';
import { DEFAULT_RESOURCE_TYPE, DEFAULT_TITLE } from '@bk2/shared-constants';

import { CommentsAccordion } from '@bk2/comment-feature';
import { ReservationsAccordion } from '@bk2/relationship-reservation-feature';

import { ResourceForm } from '@bk2/resource-ui';
import { getCategoryNameForResourceType, getUsageNameForResourceType, isReservable } from '@bk2/resource-util';

import { ResourceStore } from './resource.store';

@Component({
  selector: 'bk-resource-edit-page',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    CommentsAccordion, IconToolbar, ResourceForm, CategorySelect,
    ReservationsAccordion,
    IonContent, IonAccordionGroup, IonGrid, IonRow, IonCol
  ],
  providers: [ResourceStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-icon-toolbar icon="{{icon()}}" [title]="toolbarTitle()"/>
      @if(isTypeEditable() === true && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onTypeChange($event)" [withAll]="false" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      {{ readOnly()}}
      @if(formData(); as formData) {
        <bk-resource-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [subTypes]="subTypes()"
          [usages]="usages()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      @if(resource(); as resource) {
        <ion-accordion-group [multiple]="true">
          @if (isReservable(resource.type)) {
            <bk-reservations-accordion [listId]="listId()" [readOnly]="isReadOnly()" />
          }
          @if(hasRole('privileged') || hasRole('resourceAdmin')) {
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
          }
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class ResourceEditPage {
  protected readonly store = inject(ResourceStore);

  // inputs
  public resourceKey = input.required<string>();
  public isTypeEditable = input(false);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.resource()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.resource()?.bkey ?? '', this.type()));
  protected toolbarTitle = computed(() => this.formData()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${ResourceModelName}.${this.resourceKey()}`);
  protected currentUser = computed(() => this.store.currentUser());
  protected types = computed(() => this.store.appStore.getCategory('resource_type'));
  protected type = linkedSignal(() => this.formData()?.type ?? DEFAULT_RESOURCE_TYPE);
  protected subTypes = computed(() => {
    const catName = getCategoryNameForResourceType(this.type());
    return catName ? this.store.appStore.getCategory(catName) : undefined;
  });
  protected usages = computed(() => {
    const usageName = getUsageNameForResourceType(this.type());
    return usageName ? this.store.appStore.getCategory(usageName) : undefined;
  });
  private rowingBoatIcon = computed(() => this.store.appStore.getCategoryIcon('rboat_type', this.formData()?.subType));
  private resourceIcon = computed(() => this.store.appStore.getCategoryIcon('resource_type', this.formData()?.type));
  protected icon = computed(() => this.formData()?.type === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());
  protected resource = computed(() => this.store.resource());
  protected tags = computed(() => this.store.getResourceTags());
  protected tenantId = computed(() => this.store.tenantId());
  protected listId = computed(() => `r_${this.resourceKey()}`);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  constructor() {
    effect(() => {
      this.store.setResourceKey(this.resourceKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.store.save(this.formData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.resource()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onTypeChange(type: string): void {
    this.formDirty.set(true);
    console.log('onTypeChange: ERROR: ', type);
    //this.formData.update(vm => ({ ...vm, type }));
  }

  protected onFormDataChange(formData: ResourceModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected isReservable(resourceType?: string): boolean {
    if (!resourceType || resourceType.length === 0) return false;
    return isReservable(resourceType);
  }

  protected getTitleLabel(readOnly: boolean, key: string, type: string): string {
    if (this.readOnly()) {
      switch(type) {
        case 'key': return this.store.i18n.key_view();
        case 'locker': return this.store.i18n.locker_view();
        case 'boat': return this.store.i18n.boat_view();
        case 'rboat': return this.store.i18n.rboat_view();
        default: return this.store.i18n.view();
      }
    }
    if (key.length > 0) {
      switch(type) {
        case 'key': return this.store.i18n.key_update();
        case 'locker': return this.store.i18n.locker_update();
        case 'boat': return this.store.i18n.boat_update();
        case 'rboat': return this.store.i18n.rboat_update();
        default: return this.store.i18n.update();
      }
    } else {
      switch(type) {
        case 'key': return this.store.i18n.key_create();
        case 'locker': return this.store.i18n.locker_create();
        case 'boat': return this.store.i18n.boat_create();
        case 'rboat': return this.store.i18n.rboat_create();
        default: return this.store.i18n.create();
      }
    }
  }
}
