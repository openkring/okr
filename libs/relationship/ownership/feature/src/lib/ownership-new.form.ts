import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, IonThumbnail, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AvatarPipe } from '@bk2/avatar-ui';
import { AppStore, OrgSelectModalComponent, PersonSelectModalComponent, ResourceSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OwnershipModel, ResourceModelName, UserModel } from '@bk2/shared-models';
import { DateInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getAvatarKey, getFullName, getTodayStr, isOrg, isPerson, isResource } from '@bk2/shared-util-core';

import { ownershipValidations } from '@bk2/relationship-ownership-util';


@Component({
  selector: 'bk-ownership-new-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe, AvatarPipe,
    DateInputComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonAvatar, IonImg, IonButton, IonThumbnail, IonCard, IonCardContent
  ],
  styles: [`ion-thumbnail { width: 30px; height: 30px; }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      (formValueChange)="onFormChange($event)"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
    >
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                <ion-item lines="none">
                  <ion-avatar slot="start">
                    <ion-img src="{{ ownerModelType() + '.' + ownerKey() | avatar:'ownership' | async }}" alt="Avatar of Owner" />
                  </ion-avatar>
                  <ion-label>{{ ownerName() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                  <ion-button slot="start" fill="clear" (click)="selectOwner()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-label>{{ '@ownership.newDesc' | translate | async }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="9">
                <ion-item lines="none">
                  <ion-thumbnail slot="start">
                    <ion-img [src]="getAvatarKey() | avatar | async" alt="Logo of the resource" />
                  </ion-thumbnail>
                  <ion-label>{{ resourceName() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="3">
                <ion-item lines="none">
                <ion-button slot="start" fill="clear" (click)="selectResource()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12"> 
                <bk-date-input name="validFrom" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)" [locale]="locale()" [showHelper]=true [readOnly]="isReadOnly()" />
              </ion-col>      
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  }
  `
})
export class OwnershipNewFormComponent {
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
  protected readonly suite = ownershipValidations;
  private readonly validationResult = computed(() => ownershipValidations(this.formData()));

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

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: OwnershipModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormModel('OwnershipForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('OwnershipNewForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
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
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
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
        debugFormErrors('OwnershipNewForm (Person)', this.validationResult().errors, this.currentUser());
      }
    }
  }

  protected async selectOrg(): Promise<void> {
    const modal = await this.modalController.create({
      component: OrgSelectModalComponent,
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
        debugFormErrors('OwnershipNewForm (Org)', this.validationResult().errors, this.currentUser());
      }
    }
  }

  protected async selectResource(): Promise<void> {
    const modal = await this.modalController.create({
      component: ResourceSelectModalComponent,
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
        debugFormErrors('OwnershipNewForm (Resource)', this.validationResult().errors, this.currentUser());
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
}
