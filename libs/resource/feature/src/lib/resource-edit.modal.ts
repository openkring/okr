import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCol, IonContent, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, ResourceModel, ResourceModelName, RoleName } from '@bk2/shared-models';
import { CategorySelect, ChangeConfirmation, ChangeConfirmationI18n, Header, IconToolbar } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, safeStructuredClone } from '@bk2/shared-util-core';
import { DEFAULT_RESOURCE_TYPE } from '@bk2/shared-constants';

import { CommentsAccordion } from '@bk2/comment-feature';
import { ReservationsAccordion } from '@bk2/relationship-reservation-feature';

import { ResourceForm } from '@bk2/resource-ui';
import { getCategoryNameForResourceType, getUsageNameForResourceType, isReservable } from '@bk2/resource-util';
import { ResourceStore } from './resource.store';

@Component({
  selector: 'bk-resource-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, ReservationsAccordion,
    ResourceForm, IconToolbar, CommentsAccordion, CategorySelect,
    IonContent, IonAccordionGroup, IonGrid, IonRow, IonCol
  ],
  providers: [ResourceStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-icon-toolbar icon="{{icon()}}" [title]="toolbarTitle()"/>
      @if(isTypeEditable() && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      @if(formData(); as formData) {
        <bk-resource-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="store.currentUser()"
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
export class ResourceEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(ResourceStore);

  // inputs
  public resource = input.required<ResourceModel>();
  public isTypeEditable = input(false);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.resource()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.resource()?.bkey));
  protected toolbarTitle = computed(() => this.formData()?.name);
  protected readonly parentKey = computed(() => `${ResourceModelName}.${this.resourceKey()}`);
  protected currentUser = computed(() => this.store.currentUser());
  protected types = computed(() => this.store.getResourceTypes());
  protected subTypes = computed(() => this.getSubtypes());
  protected usages = computed(() => this.getUsages());
  protected tags = computed(() => this.store.getTags(this.type()));
  protected tenantId = computed(() => this.store.tenantId());
  protected type = linkedSignal(() => this.formData()?.type ?? DEFAULT_RESOURCE_TYPE);
  protected resourceKey = computed(() => this.resource()?.bkey ?? '');
  protected listId = computed(() => `r_${this.resourceKey()}`);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  private rowingBoatIcon = computed(() => this.store.appStore.getCategoryIcon('rboat_type', this.formData()?.subType));
  private resourceIcon = computed(() => this.store.appStore.getCategoryIcon('resource_type', this.formData()?.type));
  protected icon = computed(() => this.type() === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());

  private getUsages(): CategoryListModel | undefined {
    const usageName = getUsageNameForResourceType(this.type());
    if (usageName) return this.store.appStore.getCategory(usageName);
  }

  private getSubtypes(): CategoryListModel | undefined {
    const categoryName = getCategoryNameForResourceType(this.type());
    if (categoryName) return this.store.appStore.getCategory(categoryName);
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.resource()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formDirty.set(true);
    this.formData.update((vm: ResourceModel | undefined) => {
      if (!vm) return vm;
      return { ...vm, [fieldName]: fieldValue };
    });
  }

  protected onFormDataChange(formData: ResourceModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected isReservable(resourceType: string): boolean {
    return isReservable(resourceType);
  }

  protected getTitleLabel(readOnly: boolean, key: string): string {
    if (this.readOnly()) {
      return this.store.i18n.view_label();
    }
    if (key.length > 0) {
      return this.store.i18n.edit_label();
    } else {
      return this.store.i18n.create_label();
    }
  }
}
