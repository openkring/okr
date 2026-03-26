import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AVATAR_INFO_SHAPE, GroupModel, PersonModel, PersonModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, isPerson, safeStructuredClone } from '@bk2/shared-util-core';

import { GroupFormComponent } from '@bk2/subject-group-ui';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';

@Component({
  selector: 'bk-group-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, GroupFormComponent,
    IonContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-group-form
              [formData]="formData"
              (formDataChange)="onFormDataChange($event)" 
              [currentUser]="currentUser"
              [showForm]="showForm()"
              [allTags]="tags()"
              [tenantId]="tenantId()"
              [isNew]="isNew()"
              [readOnly]="isReadOnly()"
              (selectPerson)="selectPerson($event)"
              (dirty)="formDirty.set($event)"
              (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class GroupEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

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
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.group()));
  protected showForm = signal(true);

  // fields
  protected headerTitle = computed(() => getTitleLabel('subject.group', this.group().bkey, this.isReadOnly()));

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

  protected async selectPerson(field: 'mainContact' | 'admin'): Promise<void> {
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
        [field]: personAvatar
      };
    });
    this.formDirty.set(true);
  }

  async selectPersonModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (isPerson(data, this.appStore.env.tenantId)) {
        return data;
      }
    }
    return undefined;
  }
}
