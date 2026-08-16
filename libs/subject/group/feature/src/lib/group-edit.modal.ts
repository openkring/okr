import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AVATAR_INFO_SHAPE, GroupModel, PersonModel, PersonModelName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, isPerson, safeStructuredClone } from '@okr/shared-util-core';
import { PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';

import { GroupForm } from '@okr/subject-group-ui';
import { GROUP_I18N_KEYS, GroupI18n } from '@okr/subject-group-util';

@Component({
  selector: 'okr-group-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, GroupForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <okr-group-form
              [i18n]="i18n"
              [formData]="formData"
              (formDataChange)="onFormDataChange($event)"
              [currentUser]="currentUser"
              [showForm]="showForm()"
              [allTags]="tags()"
              [tenantId]="tenantId()"
              [isNew]="isNew()"
              [readOnly]="isReadOnly()"
              (selectPerson)="selectPerson()"
              (iconSelectClicked)="selectIcon()"
              (dirty)="formDirty.set($event)"
              (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class GroupEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(GROUP_I18N_KEYS) as GroupI18n;

  // inputs
  public group = input.required<GroupModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly tags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly isNew = input(false);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.group()));
  protected showForm = signal(true);

  // derived
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.group().okey));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.group()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: GroupModel): void {
    this.formData.set(formData);
  }

  /** Opens the icon repository browser and stores the picked icon name (same flow as MenuModal). */
  protected async selectIcon(): Promise<void> {
    const { IconSelectModal } = await import('@okr/cms-icon-feature');
    const modal = await this.modalController.create({
      component: IconSelectModal,
      componentProps: { initialDir: 'icons' },
      cssClass: 'list-modal'
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && typeof data === 'string' && data.length > 0) {
      this.formData.update((vm) => ({ ...vm, icon: data }) as GroupModel);
      this.formDirty.set(true);
    }
  }

  protected async selectPerson(): Promise<void> {
    const person = await this.selectPersonModal();
    if (!person) return;

    const personAvatar = AVATAR_INFO_SHAPE;
    personAvatar.name1 = person.firstName ?? '';
    personAvatar.name2 = person.lastName ?? '';
    personAvatar.type = person.gender ?? '';
    personAvatar.key = person.okey ?? '';
    personAvatar.modelType = PersonModelName;

    this.formData.update((vm) => {
      if (!vm) return vm;
      return {
        ...vm,
        admins: [...(vm.admins ?? []), personAvatar]
      };
    });
    this.formDirty.set(true);
  }

  async selectPersonModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data: result, role } = await modal.onWillDismiss<PersonSelectResult>();
    const data = result?.kind === 'predefined' ? result.person : undefined;
    if (role === 'confirm' && data) {
      if (isPerson(data, this.tenantId())) {
        return data;
      }
    }
    return undefined;
  }

  protected getTitleLabel(readOnly: boolean, key: string): string {
    if (this.readOnly()) {
      return this.i18n.view();
    }
    if (key.length > 0) {
      return this.i18n.update();
    } else {
      return this.i18n.create();
    }
  }
}
