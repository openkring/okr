import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AvatarPipe } from '@bk2/avatar-ui';
import { AppStore, OrgSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, DateInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, getFullName, getTodayStr, isOrg, isPerson } from '@bk2/shared-util-core';

import { MEMBERSHIP_NEW_FORM_SHAPE, MembershipFormModel, MembershipNewFormModel, membershipNewFormValidations } from '@bk2/relationship-membership-util';


@Component({
  selector: 'bk-membership-new-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe, AvatarPipe,
    DateInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonAvatar, IonImg, IonButton
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">
  
      <ion-grid>
        <ion-row>
          <ion-col size="9">
            <ion-item lines="none">
              <ion-avatar slot="start">
                <ion-img src="{{ memberModelType() + '.' + memberKey() | avatar:'membership' | async }}" alt="Avatar of Member" />
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
            <bk-cat-select [category]="membershipCategories()" [selectedItemName]="currentMembershipCategoryItem()" [readOnly]="isReadOnly()" (changed)="onCatChanged($event)" />
          </ion-col>
          <ion-col size="12"> 
            <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" [locale]="locale()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfEntry', $event)" />
          </ion-col>      
        </ion-row>
      </ion-grid>
    </form>
  `
})
export class MembershipNewFormComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public formData = model.required<MembershipNewFormModel>();
  public membershipCategories = input.required<CategoryListModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = membershipNewFormValidations;
  protected readonly shape = MEMBERSHIP_NEW_FORM_SHAPE;
  private readonly validationResult = computed(() => membershipNewFormValidations(this.formData()));

  // fields
  protected memberKey = computed(() => this.formData().memberKey ?? '');
  protected memberName = computed(() => getFullName(this.formData().memberName1, this.formData().memberName2, this.currentUser()?.nameDisplay));
  protected memberModelType = computed(() => this.formData().memberModelType ?? '');
  protected orgKey = computed(() => this.formData().orgKey ?? '');
  protected orgName = computed(() => this.formData().orgName ?? '');
  protected currentMembershipCategoryItem = computed(() => this.formData().membershipCategory ?? '');
  protected dateOfEntry = computed(() => this.formData().dateOfEntry ?? getTodayStr());
  protected readonly locale = computed(() => this.appStore.appConfig().locale);

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: MembershipNewFormModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormErrors('MembershipNewForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('MembershipNewForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected onCatChanged(membershipCategory: string): void {
    const membershipCategoryAbbreviation = this.membershipCategories().items.find(item => item.name === membershipCategory)?.abbreviation ?? 'A';
    this.formData.update((vm) => ({ ...vm, membershipCategory, membershipCategoryAbbreviation }));
    debugFormErrors('MembershipNewForm.onCatChanged', this.validationResult().errors, this.currentUser());
  }

  protected async selectMember(): Promise<void> {
    if (this.memberModelType() === 'person') {
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
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.tenantId())) {
        this.formData.update((vm) => ({
          ...vm,
          memberKey: data.bkey,
          memberName1: data.firstName,
          memberName2: data.lastName,
          memberName: getFullName(data.firstName, data.lastName, this.currentUser()?.nameDisplay),
          memberModelType: 'person',
          memberType: data.gender,
          memberDateOfBirth: data.dateOfBirth,
          memberDateOfDeath: data.dateOfDeath,
          memberZipCode: data.favZipCode,
          memberBexioId: data.bexioId
        }));
        debugFormErrors('MembershipNewForm.selectPerson', this.validationResult().errors, this.currentUser());
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
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.appStore.tenantId())) {
        this.formData.update((vm) => ({
          ...vm,
          orgKey: data.bkey,
          orgName: data.name,
        }));
        debugFormErrors('MembershipNewForm.selectOrg', this.validationResult().errors, this.currentUser());
      }
    }
  }
}
