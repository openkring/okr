import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { CategoryListForm } from '@okr/category-ui';
import { CATEGORY_I18N_KEYS, CategoryI18n, isLockedList, missingProtectedItems, protectedItems, removalWarning } from '@okr/category-util';
import { FeatureStore } from '@okr/tenant-feature';
import { dismissOverlay } from '@okr/shared-util-angular';

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
  protected readonly i18n = inject(I18nService).translateAll(CATEGORY_I18N_KEYS) as CategoryI18n;
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
  /** judged on the loaded list: typing «gender» into a new list must not lock the field */
  protected readonly lockedIdentity = computed(() => isLockedList(this.category(), this.tenantId(), this.appStore.allCategories()));
  protected readonly changeConfirmationI18n = computed(() => ({cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.category()));  // reset the form
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CategoryListModel): void {
    this.formData.set(formData);
  }
}
