import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { IonAvatar, IonButton, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AvatarPipe } from '@bk2/avatar-ui';
import { AppStore, OrgSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, DateInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, getFullPersonName, getTodayStr, isOrg, isPerson } from '@bk2/shared-util-core';

import { MembershipFormModel, MembershipNewFormModel, membershipNewFormModelShape, membershipNewFormValidations } from '@bk2/relationship-membership-util';


@Component({
  selector: 'bk-membership-new-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe, AvatarPipe,
    DateInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonAvatar, IonImg, IonButton
  ],
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
                <ion-img src="{{ memberModelType() + '.' + memberKey() | avatar | async }}" alt="Avatar of Member" />
              </ion-avatar>
              <ion-label>{{ memberName() }}</ion-label>
            </ion-item>
          </ion-col>
          <ion-col size="3">
            <ion-item lines="none">
              <ion-button slot="start" fill="clear" (click)="selectMember()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none">
              <ion-label>{{ '@membership.newDesc' | translate | async }}</ion-label>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="9">
            <ion-item lines="none">
              <ion-avatar slot="start">
                <ion-img src="{{ 'org.' + orgKey() | avatar | async }}" alt="Avatar Logo of Organization" />
              </ion-avatar>
              <ion-label>{{ orgName() }}</ion-label>
            </ion-item>
          </ion-col>
          <ion-col size="3">
            <ion-item lines="none">
            <ion-button slot="start" fill="clear" (click)="selectOrg()">{{ '@general.operation.select.label' | translate | async }}</ion-button>
            </ion-item>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12">
            <bk-cat-select [category]="membershipCategories()" [selectedItemName]="currentMembershipCategoryItem()" (changed)="onCatChanged($event)" />
          </ion-col>
          <ion-col size="12"> 
            <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" [locale]="locale()" [showHelper]=true (changed)="onChange('dateOfEntry', $event)" />
          </ion-col>      
        </ion-row>
      </ion-grid>
    </form>
  `
})
export class MembershipNewFormComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public vm = model.required<MembershipNewFormModel>();
  public membershipCategories = input.required<CategoryListModel>();
  public currentUser = input<UserModel | undefined>();

  protected memberKey = computed(() => this.vm().memberKey ?? '');
  protected memberName = computed(() => this.vm().memberName ?? '');
  protected memberModelType = computed(() => this.vm().memberModelType ?? '');
  protected orgKey = computed(() => this.vm().orgKey ?? '');
  protected orgName = computed(() => this.vm().orgName ?? '');
  protected currentMembershipCategoryItem = computed(() => this.vm().membershipCategory ?? '');
  protected dateOfEntry = computed(() => this.vm().dateOfEntry ?? getTodayStr());
  protected readonly locale = computed(() => this.appStore.appConfig().locale);

  public validChange = output<boolean>();
  protected dirtyChange = signal(true);

  protected readonly suite = membershipNewFormValidations;
  protected readonly shape = membershipNewFormModelShape;
  private readonly validationResult = computed(() => membershipNewFormValidations(this.vm()));

  protected onValueChange(value: MembershipFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('MembershipNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onCatChanged(membershipCategory: string): void {
    const membershipCategoryAbbreviation = this.membershipCategories().items.find(item => item.name === membershipCategory)?.abbreviation ?? 'A';
    this.vm.update((_vm) => ({ ..._vm, membershipCategory, membershipCategoryAbbreviation }));
    debugFormErrors('MembershipNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected async selectMember(): Promise<void> {
    if (this.memberModelType() === 'person') {
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
      if (isPerson(data, this.appStore.tenantId())) {
        this.vm.update((_vm) => ({
          ..._vm,
          memberKey: data.bkey,
          memberName1: data.firstName,
          memberName2: data.lastName,
          memberName: getFullPersonName(data.firstName, data.lastName),
          memberModelType: 'person',
          memberType: data.gender,
          memberDateOfBirth: data.dateOfBirth,
          memberDateOfDeath: data.dateOfDeath,
          memberZipCode: data.favZipCode,
          memberBexioId: data.bexioId
        }));
        debugFormErrors('MembershipNewForm (Person)', this.validationResult().errors, this.currentUser());
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
      if (isOrg(data, this.appStore.tenantId())) {
        this.vm.update((_vm) => ({
          ..._vm,
          orgKey: data.bkey,
          orgName: data.name,
        }));
        debugFormErrors('MembershipNewForm (Org)', this.validationResult().errors, this.currentUser());
        this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
        this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
      }
    }
  }
}
