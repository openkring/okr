import { Component, DestroyRef, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { AppStore, TenantLabelService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, LIST_COPY_I18N_KEYS, safeStructuredClone } from '@okr/shared-util-core';

import { CategoryItemLabelModal, CategoryListForm } from '@okr/category-ui';
import { CATEGORY_I18N_KEYS, categoryCopyStatus, CategoryI18n, CategoryItemLabel, itemLabelKey, missingProtectedItems, newCategoryItemLabel, protectedItems, removalWarning } from '@okr/category-util';
import { FeatureStore } from '@okr/tenant-feature';
import { AlertService, dismissOverlay } from '@okr/shared-util-angular';

/** What the modal hands to its opener on `confirm`. */
export interface CategoryEditResult {
  list: CategoryListModel;
  /** labels entered for added items, by item name */
  itemLabels: Record<string, CategoryItemLabel>;
}

@Component({
  selector: 'okr-category-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, CategoryListForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <okr-category-list-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="allTags()"
            [tenants]="tenantId()"
            [hasAbbreviation]="hasAbbreviation()"
            [readOnly]="isReadOnly()"
            [protectedNames]="protectedNames()"
            [missingProtected]="missingProtected()"
            [removalWarnings]="removalWarnings()"
            [lockedIdentity]="lockedIdentity()"
            [copyStatus]="category().okey ? copyStatus() : undefined"
            (itemAdded)="onItemAdded($event)"
            (restoreClicked)="restore()"
            [i18n]="i18n"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class CategoryEditModal {
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);
  private readonly alertService = inject(AlertService);
  private readonly tenantLabelService = inject(TenantLabelService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = this.i18nService.translateAll(CATEGORY_I18N_KEYS) as CategoryI18n;
  private readonly copyI18n = this.i18nService.translateAll(LIST_COPY_I18N_KEYS);
  protected readonly appStore = inject(AppStore);
  private readonly featureStore = inject(FeatureStore);

  // inputs
  public category = input.required<CategoryListModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input<string>('');
  /** When set, the tag vocabulary is read live, so a value added via «Werte bearbeiten» validates at once. */
  public tagModel = input<string>('');
  protected readonly allTags = computed(() => this.tagModel() ? this.appStore.getTags(this.tagModel()) : this.tags());
  public hasAbbreviation = input<boolean>(false);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.category()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.category()?.okey ? this.i18n.update() : this.i18n.create();
  });
  protected tenantId = computed(() => this.appStore.tenantId());

  // protection of the items code compares by name (see category-protection.util)
  protected readonly protectedNames = computed(() => protectedItems(this.formData()?.name ?? '', this.featureStore.isEnabled()));
  protected readonly missingProtected = computed(() => {
    const list = this.formData();
    return list ? missingProtectedItems(list, this.featureStore.isEnabled()) : [];
  });
  /** warned items present in the loaded list and gone from the edited one */
  protected readonly removalWarnings = computed(() => {
    const kept = new Set((this.formData()?.items ?? []).map(item => item.name));
    return (this.category().items ?? [])
      .map(item => item.name)
      .filter(name => !kept.has(name) && removalWarning(this.category().name, name, this.featureStore.isEnabled()));
  });
  protected readonly copyStatus = computed(() =>
    categoryCopyStatus(this.category(), this.appStore.allCategories(), this.tenantId(), this.formData()?.items));
  protected readonly lockedIdentity = computed(() => this.copyStatus().kind !== 'own');
  /** labels entered for items added in this session of the modal; the store writes them after the list */
  private readonly itemLabels = new Map<string, CategoryItemLabel>();
  protected readonly changeConfirmationI18n = computed(() => ({cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const list = this.formData();
    if (!list) return;
    const result: CategoryEditResult = { list, itemLabels: Object.fromEntries(this.itemLabels) };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.itemLabels.clear();
    this.formData.set(safeStructuredClone(this.category()));  // reset the form
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CategoryListModel): void {
    this.formData.set(formData);
  }

  /** Gives up the tenant's copy; the store archives it. Unsaved changes go with it. */
  protected async restore(): Promise<void> {
    if (await this.alertService.confirm(this.copyI18n.restore_confirm(), true)) {
      await dismissOverlay(this.modalController, undefined, 'restore');
    }
  }

  protected async onItemAdded(name: string): Promise<void> {
    const list = this.formData();
    const key = list && !this.isReadOnly() ? itemLabelKey(list, name, this.copyStatus().shared) : undefined;
    if (!key || !await this.tenantLabelService.lacksLabel(key, this.tenantId())) return;
    if (this.destroyRef.destroyed) return;   // saved or closed in the meantime
    const modal = await this.modalController.create({
      component: CategoryItemLabelModal,
      componentProps: { label: this.itemLabels.get(name) ?? newCategoryItemLabel(), itemName: name, i18n: this.i18n },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<CategoryItemLabel>();
    if (role === 'confirm' && data) this.itemLabels.set(name, data);
  }
}
