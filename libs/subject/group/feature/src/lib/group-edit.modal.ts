import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AVATAR_INFO_SHAPE, GroupModel, PersonModel, PersonModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, isPerson, safeStructuredClone } from '@bk2/shared-util-core';
import { PersonSelectModal, PersonSelectResult } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';

import { GroupForm } from '@bk2/subject-group-ui';
import { GROUP_I18N_KEYS, GroupI18n } from '@bk2/subject-group-util';

@Component({
  selector: 'bk-group-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, GroupForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-group-form
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
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.group().bkey));
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

  protected async selectPerson(): Promise<void> {
    const person = await this.selectPersonModal();
    if (!person) return;

    const personAvatar = AVATAR_INFO_SHAPE;
    personAvatar.name1 = person.firstName ?? '';
    personAvatar.name2 = person.lastName ?? '';
    personAvatar.type = person.gender ?? '';
    personAvatar.key = person.bkey ?? '';
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
