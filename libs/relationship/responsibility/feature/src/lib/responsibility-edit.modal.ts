import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, PersonModel, ResponsibilityModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { hasRole, safeStructuredClone } from '@bk2/shared-util-core';

import { ResponsibilityForm } from '@bk2/relationship-responsibility-ui';
import { ResponsibilityStore } from './responsibility.store';

@Component({
  selector: 'bk-responsibility-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, ResponsibilityForm,
    IonContent
  ],
  providers: [ResponsibilityStore],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(formData(); as formData) {
        <bk-responsibility-form
          [i18n]="store.i18n"
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [tenantId]="tenantId()"
          [isNew]="isNew()"
          [locale]="locale()"
          [parentName]="parentName()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (selectParent)="selectParent()"
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
  protected readonly store = inject(ResponsibilityStore);

  // inputs
  public responsibility = input.required<ResponsibilityModel>();
  public currentUser = input<UserModel | undefined>();
  public locale = input.required<string>();
  public readonly isNew = input(false);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.responsibility()));

  // fields
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(false, this.responsibility()?.bkey));
  protected showConfirmation = computed(() => this.formDirty() && this.formValid());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected readonly tenantId = computed(() => this.store.tenantId());
  protected readonly parentName = computed(() => {
    const parentKey = this.formData()?.parentKey;
    if (!parentKey) return '';
    const dot = parentKey.indexOf('.');
    if (dot === -1) return parentKey;
    const modelType = parentKey.slice(0, dot);
    const key = parentKey.slice(dot + 1);
    if (modelType === 'org') return this.store.appStore.getOrg(key)?.name ?? parentKey;
    if (modelType === 'group') return this.store.appStore.getGroup(key)?.name ?? parentKey;
    return parentKey;
  });

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

  protected async selectParent(): Promise<void> {
    const parentKey = await this.store.selectParent();
    if (!parentKey) return;
    this.formData.update(vm => ({ ...vm, parentKey }) as ResponsibilityModel);
    this.formDirty.set(true);
  }

  protected async selectResponsibleAvatar(): Promise<void> {
    const person = await this.store.selectPerson();
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
    const person = await this.store.selectPerson();
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
}
