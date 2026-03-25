import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, PersonModel, ResponsibilityModel, ResponsibilityModelName, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole, isPerson, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';

import { ResponsibilityForm } from '@bk2/relationship-responsibility-ui';

@Component({
  selector: 'bk-responsibility-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent,
    ChangeConfirmationComponent, ResponsibilityForm,
    IonContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(formData(); as formData) {
        <bk-responsibility-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [tenantId]="tenantId()"
          [isNew]="isNew()"
          [locale]="locale()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (selectResponsible)="selectResponsibleAvatar()"
          (selectDelegate)="selectDelegateAvatar()"
          (clearDelegate)="onClearDelegate()"
        />
      }
    </ion-content>
  `,
})
export class ResponsibilityEditModal {
  private readonly modalController = inject(ModalController);
  private readonly appstore = inject(AppStore);

  // inputs
  public responsibility = input.required<ResponsibilityModel>();
  public currentUser = input<UserModel | undefined>();
  public locale = input.required<string>();
  public readonly isNew = input(false);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formDirty() && this.formValid());
  protected formData = linkedSignal(() => safeStructuredClone(this.responsibility()));

  // fields
  protected readonly headerTitle = computed(() => getTitleLabel('responsibility', this.responsibility()?.bkey, false));
  protected readonly tenantId = computed(() => this.appstore.tenantId());

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.responsibility()));
  }

  protected onFormDataChange(formData: ResponsibilityModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async selectResponsibleAvatar(): Promise<void> {
    const person = await this.openPersonSelectModal();
    if (!person) return;
    this.formDirty.set(true);
    this.formData.update(vm => ({
      ...vm,
      responsibleAvatar: {
        key: person.bkey ?? '',
        name1: person.firstName,
        name2: person.lastName,
        modelType: 'person',
        type: person.gender,
        subType: '',
        label: `${person.firstName} ${person.lastName}`.trim(),
      } as AvatarInfo,
    }) as ResponsibilityModel);
  }

  protected async selectDelegateAvatar(): Promise<void> {
    const person = await this.openPersonSelectModal();
    if (!person) return;
    this.formDirty.set(true);
    this.formData.update(vm => ({
      ...vm,
      delegateAvatar: {
        key: person.bkey ?? '',
        name1: person.firstName,
        name2: person.lastName,
        modelType: 'person',
        type: person.gender,
        subType: '',
        label: `${person.firstName} ${person.lastName}`.trim(),
      } as AvatarInfo,
    }) as ResponsibilityModel);
  }

  protected onClearDelegate(): void {
    this.formDirty.set(true);
    this.formData.update(vm => ({ ...vm, delegateAvatar: undefined }) as ResponsibilityModel);
  }

  private async openPersonSelectModal(): Promise<PersonModel | undefined> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: { selectedTag: '', currentUser: this.currentUser() },
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data && isPerson(data, this.tenantId())) return data;
    return undefined;
  }
}
