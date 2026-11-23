import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { AppStore, TenantLabelService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, completeLabels, getItemLabel, LIST_COPY_I18N_KEYS, safeStructuredClone, toI18nRef } from '@okr/shared-util-core';

import { CategoryItemLabelModal, CategoryListForm } from '@okr/category-ui';
import { CATEGORY_I18N_KEYS, categoryCopyStatus, CategoryI18n, CategoryItemLabel, missingProtectedItems, newCategoryItemLabel, protectedItems, removalWarning } from '@okr/category-util';
import { FeatureStore } from '@okr/tenant-feature';
import { AlertService, dismissOverlay } from '@okr/shared-util-angular';

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
  /** labels entered for items added in this session of the modal, stored with the list */
  private readonly itemLabels = new Map<string, CategoryItemLabel>();
  protected readonly changeConfirmationI18n = computed(() => ({cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const list = this.formData();
    await dismissOverlay(this.modalController, list, 'confirm');
    if (list && !this.isReadOnly()) await this.saveItemLabels(list);
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
    if (!list || this.isReadOnly() || !await this.needsLabel(list, name)) return;
    const modal = await this.modalController.create({
      component: CategoryItemLabelModal,
      componentProps: { label: this.itemLabels.get(name) ?? newCategoryItemLabel(), itemName: name, i18n: this.i18n },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<CategoryItemLabel>();
    if (role === 'confirm' && data) this.itemLabels.set(name, data);
  }

  /** An item of a translated list that neither a bundle nor an override names; its raw key would show. */
  private async needsLabel(list: CategoryListModel, name: string): Promise<boolean> {
    const label = getItemLabel(list, name);
    const ref = toI18nRef(label);
    if (!ref || this.copyStatus().shared?.items?.some(item => item.name === name)) return false;
    if (!await this.i18nService.lacksTranslation(label)) return false;
    return !await this.tenantLabelService.findOverride(ref.module, ref.key, this.tenantId());
  }

  private async saveItemLabels(list: CategoryListModel): Promise<void> {
    const loaded = new Set((this.category().items ?? []).map(item => item.name));
    for (const { name } of list.items ?? []) {
      const ref = toI18nRef(getItemLabel(list, name));
      if (!ref || loaded.has(name) || !await this.needsLabel(list, name)) continue;
      const labels = completeLabels({ ...(this.itemLabels.get(name) ?? newCategoryItemLabel()) }, name);
      await this.tenantLabelService.saveOverride(ref.module, ref.key, this.tenantId(), labels, undefined, undefined, this.i18n.update_error());
    }
  }
}
