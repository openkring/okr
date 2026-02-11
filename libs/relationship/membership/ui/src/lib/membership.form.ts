import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonNote, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask } from '@bk2/shared-config';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_MSTATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AppStore, OrgSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared-feature';
import { CategoryListModel, MembershipModel, PrivacySettings, RoleName, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, ChipsComponent, DateInputComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getFullName, getItemLabel, hasRole, isOrg, isPerson, isVisibleToUser } from '@bk2/shared-util-core';

import { membershipValidations } from '@bk2/relationship-membership-util';
import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-membership-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TranslatePipe, AsyncPipe, AvatarPipe,
    TextInputComponent, DateInputComponent,
    ChipsComponent, NotesInputComponent, CategorySelectComponent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonCard, IonCardContent, IonAvatar, IonImg, IonButton
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        [suite]="suite" 
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
        (formValueChange)="onFormChange($event)">
      
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <!------------------------------------------- new membership: select member and org ------------------------------------------------->
              @if(isNew()) {
                <ion-grid>
                  <ion-row>
                    <ion-col size="9">
                      <ion-item lines="none">
                        <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                          <ion-img src="{{ memberModelType() + '.' + memberKey() | avatar:'membership' }}" alt="Avatar of Member" />
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
                        <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                          <ion-img src="{{ 'org.' + orgKey() | avatar }}" alt="Avatar Logo of Organization" />
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
                      <bk-cat-select [category]="membershipCategories()" [selectedItemName]="currentMembershipCategoryItem()" (selectedItemNameChange)="onFieldChange('membershipCategory', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12"> 
                      <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" (storeDateChange)="onFieldChange('dateOfEntry', $event)" [locale]="locale()" [showHelper]=true [readOnly]="isReadOnly()" />
                    </ion-col>      
                  </ion-row>
                </ion-grid>
              } @else {
                <!-------------------------existing membership: category and state can not be changed here, only with separate methods ------------------------------>
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" (storeDateChange)="onFieldChange('dateOfEntry', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
                    </ion-col>
              
                    @if(dateOfExit() && dateOfExit().length > 0 && dateOfExit() !== endFutureDate) {
                      <ion-col size="12" size-md="6">
                        <bk-date-input name="dateOfExit" [storeDate]="dateOfExit()" (storeDateChange)="onFieldChange('dateOfExit', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
                      </ion-col>
                    }
                  </ion-row>
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <ion-item lines="none">
                        <ion-label>{{ '@membership.category.label' | translate | async }}:</ion-label>
                        <ion-label>{{ membershipCategory() | translate | async }}</ion-label>
                      </ion-item>
                      <ion-item lines="none">
                        <ion-note>{{ '@membership.category.helper' | translate | async }}</ion-note>
                      </ion-item>
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <ion-item lines="none">
                        <ion-label>{{ '@input.memberState.label' | translate | async }}:</ion-label>
                        <ion-label>{{ membershipState() }}</ion-label>
                      </ion-item>
                      <ion-item lines="none">
                        <ion-note>{{ '@membership.state.helper' | translate | async }}</ion-note>
                      </ion-item>
                    </ion-col>
                    
<!--                     
                    tbd: MembershipForm: change price to MoneyModel input
                    <ion-col size="12" size-md="6">
                      <bk-number-input name="price" [value]="price()" (valueChange)="onFieldChange('price', $event)" [maxLength]=6 [readOnly]="isReadOnly()" />                                        
                    </ion-col> -->
                  </ion-row>
                </ion-grid>
              }

              <!--------------------------------------------------- properties --------------------------------------------------->
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6"> 
                    <bk-text-input name="memberId" [value]="memberId()" (valueChange)="onFieldChange('memberId', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />                                        
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-text-input name="memberBexioId" [value]="memberBexioId()" (valueChange)="onFieldChange('memberBexioId', $event)" [maxLength]=6 [mask]="bexioMask" [readOnly]="isReadOnly()" />                                        
                  </ion-col>

                  <ion-col size="12" size-md="6"> 
                    <bk-text-input name="memberAbbreviation" [value]="memberAbbreviation()" (valueChange)="onFieldChange('memberAbbreviation', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />                                        
                  </ion-col>

                  @if(hasRole('memberAdmin')) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="memberNickName" [value]="memberNickName()" (valueChange)="onFieldChange('memberNickName', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />                                        
                  </ion-col>

                  <ion-col size="12" size-md="6"> 
                    <bk-text-input name="orgFunction" [value]="orgFunction()" (valueChange)="onFieldChange('orgFunction', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />                                        
                  </ion-col>
                  }
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>

          @if(isTagsVisible()) {
            <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
          }
          
          @if(isNotesVisible()) {
            <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
          }
        </form>
      }
  `
})
export class MembershipFormComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public readonly formData = model.required<MembershipModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public membershipCategories = input.required<CategoryListModel>();
  public readonly allTags = input.required<string>();
  public readonly priv = input.required<PrivacySettings>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = membershipValidations;
  private readonly validationResult = computed(() => membershipValidations(this.formData(), this.appStore.env.tenantId, this.allTags()));

  // fields
  protected isNew = computed(() => !this.formData().bkey);
  protected memberKey = linkedSignal(() => this.formData().memberKey ?? '');
  protected memberName1 = computed(() => this.formData().memberName1 ?? DEFAULT_NAME); 
  protected memberName2 = computed(() => this.formData().memberName2 ?? DEFAULT_NAME);
  protected memberName = linkedSignal(() => getFullName(this.formData().memberName1, this.formData().memberName2, this.currentUser()?.nameDisplay));
  protected memberModelType = computed(() => this.formData().memberModelType ?? 'person');
  protected memberGender = computed(() => this.formData().memberType ?? DEFAULT_GENDER);
  protected memberOrgType = computed(() => this.formData().memberType ?? DEFAULT_ORG_TYPE);
  protected memberNickName = linkedSignal(() => this.formData().memberNickName ?? DEFAULT_NAME);
  protected memberAbbreviation = linkedSignal(() => this.formData().memberAbbreviation ?? '');
  protected memberDateOfBirth = computed(() => this.formData().memberDateOfBirth ?? DEFAULT_DATE);
  protected memberZipCode = computed(() => this.formData().memberZipCode ?? '');
  protected memberBexioId = linkedSignal(() => this.formData().memberBexioId ?? '');
  protected orgKey = computed(() => this.formData().orgKey ?? DEFAULT_KEY);
  protected orgName = linkedSignal(() => this.formData().orgName ?? '');
  protected memberId = computed(() => this.formData().memberId ?? DEFAULT_ID);
  protected dateOfEntry = linkedSignal(() => this.formData().dateOfEntry ?? DEFAULT_DATE);
  protected dateOfExit = linkedSignal(() => this.formData().dateOfExit ?? DEFAULT_DATE);
  protected membershipCategory = computed(() => getItemLabel(this.membershipCategories(), this.formData().category));
  protected currentMembershipCategoryItem = linkedSignal(() => this.formData().category ?? '');
  protected orgFunction = linkedSignal(() => this.formData().orgFunction ?? '');
  protected order = computed(() => this.formData().order ?? 0);
  protected relLog = computed(() => this.formData().relLog ?? '');
  protected relIsLast = computed(() => this.formData().relIsLast ?? true);
  protected price = linkedSignal(() => this.formData().price ?? 0);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected membershipState = computed(() => this.formData().category ?? DEFAULT_MSTATE);
  protected i18nBase = computed(() => this.membershipCategories().i18nBase);
  protected name = computed(() => this.membershipCategories().name);
  protected readonly locale = linkedSignal(() => this.appStore.appConfig().locale);
  protected bkey = computed(() => this.formData().bkey ?? '');
  
  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected endFutureDate = END_FUTURE_DATE_STR;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: MembershipModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('MembershipForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('MembershipForm.onFormChange', this.validationResult().errors, this.currentUser());
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
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.tenantId())) {
        this.formData.update((vm) => ({
          ...vm,
          memberKey: data.bkey,
          memberName1: data.firstName,
          memberName2: data.lastName,
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
    await modal.present();
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

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
  
  protected isTagsVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showTags, this.currentUser())) return false;
    return (this.tags() && this.tags().length > 0) ? true : false;
  }

  protected isNotesVisible(): boolean {
    if (!this.isReadOnly()) return true;
    if (!isVisibleToUser(this.priv().showNotes, this.currentUser())) return false;
    return (this.notes() && this.notes().length > 0) ? true : false;
  }
}
