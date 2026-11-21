import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { AppStore, PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, HouseholdModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { getFullName, safeStructuredClone } from '@okr/shared-util-core';
import { HouseholdForm } from '@okr/relationship-household-ui';
import { HOUSEHOLD_I18N_KEYS, HouseholdEditMode, HouseholdI18n } from '@okr/relationship-household-util';

/**
 * Edits a household; dismisses with the edited copy and role 'confirm'. The opener (`HouseholdStore.edit`) saves it
 * through the callable. No store is injected here — the store opens this modal, importing it back would be circular.
 */
@Component({
  selector: 'okr-household-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, HouseholdForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-household-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [mode]="mode()"
          [typeList]="typeList()"
          [personNames]="personNames()"
          [showForm]="showForm()"
          (addMember)="addMember()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class HouseholdEditModal {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(HOUSEHOLD_I18N_KEYS) as HouseholdI18n;

  // inputs
  public readonly household = input.required<HouseholdModel>();
  public readonly mode = input<HouseholdEditMode>('member');
  public readonly typeList = input.required<CategoryListModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.household()));
  protected showForm = signal(true);

  // derived
  protected readonly headerTitle = computed(() => this.household().okey ? this.i18n.title_edit() : this.i18n.title_new());
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  /** names of the persons in the form, from the persons the app has loaded */
  protected readonly personNames = computed(() => {
    const names: Record<string, string> = {};
    for (const key of this.formData()?.memberKeys ?? []) {
      const p = this.appStore.getPerson(key);
      if (p) names[key] = getFullName(p.firstName, p.lastName);
    }
    return names;
  });

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.household()));
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: HouseholdModel): void {
    this.formData.set(formData);
  }

  /** admin only: pick a person who is not yet in the household */
  protected async addMember(): Promise<void> {
    const currentUser = this.appStore.currentUser();
    if (!currentUser) return;
    const memberKeys = this.formData()?.memberKeys ?? [];
    const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: ['modal-narrow', 'modal-fixed-height'],
      componentProps: { selectedTag: '', currentUser, excludeKeys: memberKeys },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<PersonSelectResult>();
    if (role !== 'confirm' || data?.kind !== 'predefined') return;
    const personKey = data.person.okey;
    if (!personKey || memberKeys.includes(personKey)) return;
    this.formData.update((vm) => vm ? { ...vm, memberKeys: [...(vm.memberKeys ?? []), personKey] } : vm);
    this.formDirty.set(true);
  }
}
