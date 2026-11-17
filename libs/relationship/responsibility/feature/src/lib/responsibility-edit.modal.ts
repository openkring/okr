import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonContent, ModalController } from '@ionic/angular';

import { AvatarInfo, PersonModel, ResponsibilityModel, ResponsibilityModelName, RoleName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { hasRole, safeStructuredClone } from '@okr/shared-util-core';

import { AvatarService } from '@okr/avatar-data-access';
import { AvatarToolbar } from '@okr/avatar-feature';
import { ResponsibilityForm } from '@okr/relationship-responsibility-ui';
import { getResponsibilityImageKey } from '@okr/relationship-responsibility-util';
import { dismissOverlay } from '@okr/shared-util-angular';
import { ResponsibilityStore } from './responsibility.store';

@Component({
  selector: 'okr-responsibility-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, ResponsibilityForm, AvatarToolbar,
    IonContent
  ],
  providers: [ResponsibilityStore],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if(!isNew()) {
        <okr-avatar-toolbar [key]="portraitKey()" modelType="person" [readOnly]="!hasRole('privileged')" [title]="formData()?.name ?? ''" [subTitle]="portraitHint()" (imageSelected)="onImageSelected($event)" />
      }
      @if(formData(); as formData) {
        <okr-responsibility-form
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
  private readonly avatarService = inject(AvatarService);
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
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(false, this.responsibility()?.okey));
  protected showConfirmation = computed(() => this.formDirty() && this.formValid());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected readonly tenantId = computed(() => this.store.tenantId());
  /** the responsibility's own portrait (`responsibility.<okey>`), else the responsible person's avatar */
  protected readonly portraitKey = computed(() =>
    getResponsibilityImageKey(this.formData(), key => !!this.avatarService.getCachedStoragePath(key)));
  protected readonly portraitHint = computed(() => this.portraitKey().startsWith(`${ResponsibilityModelName}.`)
    ? this.store.i18n.portrait_own()
    : this.store.i18n.portrait_fallback());
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
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.responsibility()));
  }

  /** Uploads the portrait right away (like every avatar); it overrides the person's avatar for this responsibility. */
  protected async onImageSelected(photo: Photo): Promise<void> {
    const okey = this.responsibility().okey;
    if (!okey) return;
    await this.avatarService.saveAvatarPhoto(photo, okey, this.tenantId(), ResponsibilityModelName);
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
        key: person.okey ?? '',
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
        key: person.okey ?? '',
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
