import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, IonThumbnail, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { AsyncPipe } from '@angular/common';

import { ENV } from '@bk2/shared/config';
import { DateInputComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ModelType, UserModel } from '@bk2/shared/models';
import { debugFormErrors, getAvatarKey, getFullPersonName, getTodayStr, isOrg, isPerson, isResource } from '@bk2/shared/util';
import { OrgSelectModalComponent, PersonSelectModalComponent, ResourceSelectModalComponent } from '@bk2/shared/feature';
import { AvatarPipe } from '@bk2/shared/pipes';

import { OwnershipFormModel, OwnershipNewFormModel, ownershipNewFormModelShape, ownershipNewFormValidations } from '@bk2/ownership/util';


@Component({
  selector: 'bk-ownership-new-form',
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe, AvatarPipe,
    DateInputComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonAvatar, IonImg, IonButton, IonThumbnail
  ],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],

  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">
  
      <ion-grid>
        <ion-row>
          <ion-col size="9">
            <ion-item lines="none">
              <ion-avatar slot="start">
                <ion-img src="{{ ownerModelType() + '.' + ownerKey() | avatar | async }}" alt="Avatar of Owner" />
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
            <bk-date-input name="validFrom" [storeDate]="validFrom()" [showHelper]=true (changed)="onChange('validFrom', $event)" />
          </ion-col>      
        </ion-row>
      </ion-grid>
    </form>
  `
})
export class OwnershipNewFormComponent {
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);

  public vm = model.required<OwnershipNewFormModel>();
  public currentUser = input<UserModel | undefined>();

  protected ownerKey = computed(() => this.vm().ownerKey ?? '');
  protected ownerName = computed(() => getFullPersonName(this.vm().ownerName1 ?? '', this.vm().ownerName2 ?? ''));
  protected ownerModelType = computed(() => this.vm().ownerModelType ?? '');
  protected resourceKey = computed(() => this.vm().resourceKey ?? '');
  protected resourceType = computed(() => this.vm().resourceType ?? '');
  protected resourceModelType = computed(() => this.vm().resourceModelType ?? '');
  protected resourceName = computed(() => this.vm().resourceName ?? '');
  protected validFrom = computed(() => this.vm().validFrom ?? getTodayStr());

  public validChange = output<boolean>();
  protected dirtyChange = signal(true);
  
  protected readonly suite = ownershipNewFormValidations;
  protected readonly shape = ownershipNewFormModelShape;
  private readonly validationResult = computed(() => ownershipNewFormValidations(this.vm()));

  protected modelType = ModelType;

  protected onValueChange(value: OwnershipFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('OwnershipNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected async selectOwner(): Promise<void> {
    if (this.ownerModelType() === ModelType.Person) {
      this.selectPerson();
    } else {
      this.selectOrg();
    }
  }

  protected async selectPerson(): Promise<void> {
    const _modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.env.owner.tenantId)) {
        this.vm.update((_vm) => ({
          ..._vm, 
          ownerKey: data.bkey, 
          ownerName1: data.firstName,
          ownerName2: data.lastName,
          ownerModelType: ModelType.Person,
          ownerType: data.gender,
        }));
        debugFormErrors('OwnershipNewForm (Person)', this.validationResult().errors, this.currentUser());
        this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
        this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());    
      }
    }
  }

  protected async selectOrg(): Promise<void> {
    const _modal = await this.modalController.create({
      component: OrgSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: 'selectable',
        currentUser: this.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.env.owner.tenantId)) {
        this.vm.update((_vm) => ({
          ..._vm, 
          ownerKey: data.bkey,
          ownerName1: '',
          ownerName2: data.name,
          ownerModelType: ModelType.Org,
          ownerType: data.type,
        }));
        debugFormErrors('OwnershipNewForm (Org)', this.validationResult().errors, this.currentUser());
        this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
        this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());    
      }
    }  
  }

  protected async selectResource(): Promise<void> {
    const _modal = await this.modalController.create({
      component: ResourceSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isResource(data, this.env.owner.tenantId)) {
        this.vm.update((_vm) => ({
          ..._vm, 
          resourceKey: data.bkey, 
          resourceModelType: ModelType.Resource,
          resourceType: data.type,
          resourceSubType: data.subType,
          resourceName: data.name,
        }));
        debugFormErrors('OwnershipNewForm (Resource)', this.validationResult().errors, this.currentUser());
        this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
        this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());    
      }
    }  
  }

  /******************************* getters *************************************** */
  // 20.0:key for a rowing boat, 20.4:key for a locker
  protected getAvatarKey(): string {
    const _ownership = this.vm();
    if (_ownership.resourceModelType !== undefined && _ownership.resourceKey) {
      return getAvatarKey(_ownership.resourceModelType, _ownership.resourceKey, _ownership.resourceType, _ownership.resourceSubType);
    }
    return ModelType.Resource + '.' + this.env.settingsDefaults.defaultResource; // default avatar
  }
}
