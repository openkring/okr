import { Component, computed, effect, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';

import { AvatarPipe } from '@bk2/avatar-ui';
import { AppStore, OrgSelectModal, PersonSelectModal, PersonSelectResult, ResourceSelectModal } from '@bk2/shared-feature';
import { OwnershipModel, OwnershipModelName, ResourceModelName, UserModel } from '@bk2/shared-models';
import { DateInput, DateInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, getAvatarKey, getCategoryIcon, getFullName, getTodayStr, isOrg, isPerson, isResource } from '@bk2/shared-util-core';

import { ownershipValidations } from '@bk2/relationship-ownership-util';
import { OwnershipStore } from './ownership.store';


@Component({
  selector: 'bk-ownership-new-form',
  standalone: true,
  providers: [OwnershipStore],
  imports: [
    AvatarPipe,
    DateInput,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonAvatar, IonImg, IonButton, IonCard, IonCardContent
  ],
  template: `
  @if (showForm()) {
    <form novalidate>
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                <ion-item lines="none">
                  <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                    <ion-img src="{{ ownerModelType() + '.' + ownerKey() | avatar:'ownership' }}" alt="Avatar of Owner" />
                  </ion-avatar>
                  <ion-label>{{ ownerName() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                  <ion-button slot="start" fill="clear" (click)="selectOwner()">{{ store.i18n.select() }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ store.i18n.new_desc() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="9">
                <ion-item lines="none">
                  <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                    <ion-img [src]="getAvatarKey() | avatar:getIcon(formData()) " alt="Logo of the resource" />
                  </ion-avatar>
                  <ion-label>{{ resourceName() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectResource()">{{ store.i18n.select() }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <bk-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  }
  `
})
export class OwnershipNewForm {
  protected readonly store = inject(OwnershipStore);
  protected validFromI18n = computed(() => ({ name: 'validFrom', label: this.store.i18n.validFrom_label(), placeholder: this.store.i18n.validFrom_placeholder(), helper: this.store.i18n.validFrom_helper() } as DateInputI18n));
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public readonly formData = model.required<OwnershipModel>();
  public currentUser = input<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  private readonly validationResult = computed(() => ownershipValidations(this.formData(), this.appStore.tenantId(), this.appStore.getTags(OwnershipModelName)));

  // fields
  protected ownerKey = computed(() => this.formData().ownerKey ?? '');
  protected ownerName = computed(() => getFullName(this.formData().ownerName1, this.formData().ownerName2, this.currentUser()?.nameDisplay));
  protected ownerModelType = computed(() => this.formData().ownerModelType ?? '');
  protected resourceKey = computed(() => this.formData().resourceKey ?? '');
  protected resourceType = computed(() => this.formData().resourceType ?? '');
  protected resourceModelType = computed(() => this.formData().resourceModelType ?? '');
  protected resourceName = computed(() => this.formData().resourceName ?? '');
  protected validFrom = linkedSignal(() => this.formData().validFrom ?? getTodayStr());
  protected locale = computed(() => this.appStore.appConfig().locale);

  private rboatTypes = this.appStore.getCategory('rboat_type');
  private resourceTypes = this.appStore.getCategory('resource_type');

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected async selectOwner(): Promise<void> {
    if (this.ownerModelType() === 'person') {
      this.selectPerson();
    } else {
      this.selectOrg();
    }
  }

  protected async selectPerson(): Promise<void> {
    const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    await modal.present();
    const { data: result, role } = await modal.onWillDismiss<PersonSelectResult>();
    const data = result?.kind === 'predefined' ? result.person : undefined;
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.tenantId())) {
        this.formData.update((vm) => ({
          ...vm,
          ownerKey: data.bkey,
          ownerName1: data.firstName,
          ownerName2: data.lastName,
          ownerModelType: 'person',
          ownerType: data.gender,
        }));
      }
    }
  }

  protected async selectOrg(): Promise<void> {
    const modal = await this.modalController.create({
      component: OrgSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: 'selectable',
        currentUser: this.currentUser()
      }
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.appStore.tenantId())) {
        this.formData.update((vm) => ({
          ...vm,
          ownerKey: data.bkey,
          ownerName1: '',
          ownerName2: data.name,
          ownerModelType: 'org',
          ownerType: data.type,
        }));
      }
    }
  }

  protected async selectResource(): Promise<void> {
    const modal = await this.modalController.create({
      component: ResourceSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isResource(data, this.appStore.tenantId())) {
        this.formData.update((vm) => ({
          ...vm,
          resourceKey: data.bkey,
          resourceModelType: 'resource',
          resourceType: data.type,
          resourceSubType: data.subType,
          resourceName: data.name,
        }));
        this.dirty.emit(true);
      }
    }
  }

  /******************************* getters *************************************** */
  // resource.rboat:key for a rowing boat, resource.locker:key for a locker
  protected getAvatarKey(): string {
    const ownership = this.formData();
    if (ownership.resourceModelType !== undefined && ownership.resourceKey) {
      return getAvatarKey(ownership.resourceModelType, ownership.resourceKey, ownership.resourceType, ownership.resourceSubType);
    }
    return `${ResourceModelName}.${this.appStore.defaultResource()?.bkey}`; // default avatar
  }

  protected getIcon(ownership: OwnershipModel): string {
    if (ownership.resourceType === 'rboat') {
      return getCategoryIcon(this.rboatTypes, ownership.resourceSubType);
    } else {
      return getCategoryIcon(this.resourceTypes, ownership.resourceType);
    }
  }
}
