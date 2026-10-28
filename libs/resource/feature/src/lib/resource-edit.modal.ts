import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonAccordionGroup, IonCol, IonContent, IonGrid, IonRow, ModalController } from '@ionic/angular';

import { CategoryListModel, ResourceModel, ResourceModelName, RoleName } from '@okr/shared-models';
import { CategorySelect, ChangeConfirmation, ChangeConfirmationI18n, Header, IconToolbar } from '@okr/shared-ui';
import { coerceBoolean, getAvatarInfo, hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { DEFAULT_RESOURCE_TYPE } from '@okr/shared-constants';

import { CommentsAccordion } from '@okr/comment-feature';
import { ReservationService } from '@okr/relationship-reservation-data-access';
import { ReservationsAccordion } from '@okr/relationship-reservation-feature';
import { findActiveLockReservations } from '@okr/relationship-reservation-util';
import { ResourceOwnersAccordion } from '@okr/relationship-ownership-feature';

import { ResourceForm, ResourceLockedBanner } from '@okr/resource-ui';
import { getCategoryNameForResourceType, getUsageNameForResourceType, isReservable } from '@okr/resource-util';
import { dismissOverlay } from '@okr/shared-util-angular';
import { ResourceStore } from './resource.store';

@Component({
  selector: 'okr-resource-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, ReservationsAccordion, ResourceOwnersAccordion,
    ResourceForm, ResourceLockedBanner, IconToolbar, CommentsAccordion, CategorySelect,
    IonContent, IonAccordionGroup, IonGrid, IonRow, IonCol
  ],
  providers: [ResourceStore],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-icon-toolbar icon="{{icon()}}" [title]="toolbarTitle()"/>
      @if(isLocked()) {
        <okr-resource-locked-banner [title]="store.i18n.locked_title()" [reason]="lockReason()" />
      }
      @if(isTypeEditable() && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      @if(formData(); as formData) {
        <okr-resource-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="store.currentUser()"
          [subTypes]="subTypes()"
          [usages]="usages()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          [locked]="locked()"
          (lockedChange)="lockedEdit.set($event)"
          [showLock]="showLock()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      @if(resource(); as resource) {
        <ion-accordion-group [multiple]="true">
          @if(resource.okey) {
            <okr-resource-owners-accordion [resource]="resource" [readOnly]="!hasRole('resourceAdmin')" />
          }
          @if (isReservable(resource.type)) {
            <okr-reservations-accordion [listId]="listId()" [readOnly]="isReadOnly()" />
          }
          @if(hasRole('privileged') || hasRole('resourceAdmin')) {
              <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
          }
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class ResourceEditModal {
  private readonly modalController = inject(ModalController);
  private readonly reservationService = inject(ReservationService);
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
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.resource()?.okey));
  protected toolbarTitle = computed(() => this.formData()?.name);
  protected readonly parentKey = computed(() => `${ResourceModelName}.${this.resourceKey()}`);
  protected currentUser = computed(() => this.store.currentUser());
  protected types = computed(() => this.store.getResourceTypes());
  protected subTypes = computed(() => this.getSubtypes());
  protected usages = computed(() => this.getUsages());
  protected tags = computed(() => this.store.getTags(this.type()));
  protected tenantId = computed(() => this.store.tenantId());
  protected type = linkedSignal(() => this.formData()?.type ?? DEFAULT_RESOURCE_TYPE);
  protected resourceKey = computed(() => this.resource()?.okey ?? '');
  protected listId = computed(() => `r_${this.resourceKey()}`);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  private rowingBoatIcon = computed(() => this.store.appStore.getCategoryIcon('rboat_type', this.formData()?.subType));
  private resourceIcon = computed(() => this.store.appStore.getCategoryIcon('resource_type', this.formData()?.type));
  protected icon = computed(() => this.type() === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());

  // lock: an active 'maintenance' (damage report) or 'blocked' reservation of this boat
  private readonly reservationsResource = rxResource({
    params: () => ({ resourceKey: this.resourceKey() }),
    stream: ({ params }) => this.reservationService.listReservationsForResource(params.resourceKey)
  });
  private readonly activeLocks = computed(() => findActiveLockReservations(this.reservationsResource.value() ?? [], this.resourceKey()));
  protected readonly isLocked = computed(() => this.activeLocks().length > 0);
  /** the stored tripAlert; the reservation text for a lock without one (damage report) */
  protected readonly lockReason = computed(() => (this.resource()?.tripAlert ?? '').trim() || this.activeLocks()[0]?.description || '');
  /**
   * The checkbox value the user chose; undefined = untouched, then it follows the stored state.
   * Deliberately not a linkedSignal over the reservations stream — a re-emission would reset the user's choice.
   */
  protected readonly lockedEdit = signal<boolean | undefined>(undefined);
  protected readonly locked = computed(() => this.lockedEdit() ?? this.isLocked());
  // a lock needs the boat's key, so a new boat is locked only after it was saved once
  protected readonly showLock = computed(() => this.type() === 'rboat' && this.resourceKey().length > 0);

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
    await this.saveLock();
    await dismissOverlay(this.modalController, this.formData(), 'confirm');  
  }

  /**
   * Store a changed «Boot sperren» checkbox. The lock is a reservation, not a resource field, so the
   * modal writes it itself; the resource (with its tripAlert as the reason) is saved by the caller.
   */
  private async saveLock(): Promise<void> {
    const locked = this.lockedEdit();
    if (locked === undefined || locked === this.isLocked() || this.isReadOnly()) return;
    if (locked) {
      const avatar = getAvatarInfo(this.formData(), 'resource');
      if (avatar) await this.reservationService.lockResource(avatar, this.formData()?.tripAlert ?? '', this.store.currentUser());
    } else {
      await this.reservationService.unlockResource(this.activeLocks(), this.store.currentUser());
    }
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.lockedEdit.set(undefined);
    this.formData.set(safeStructuredClone(this.resource()));  // reset the form
    // re-mount the form so its field state (touched, error notes) starts fresh
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
      return this.store.i18n.view();
    }
    if (key.length > 0) {
      return this.store.i18n.update();
    } else {
      return this.store.i18n.create();
    }
  }
}
