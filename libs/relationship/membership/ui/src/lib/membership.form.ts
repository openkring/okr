import { FormsModule } from '@angular/forms';
import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonNote, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask } from '@bk2/shared-config';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_MSTATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AppStore, OrgSelectModal, PersonSelectModal } from '@bk2/shared-feature';
import { CategoryListModel, MembershipModel, PrivacySettings, RoleName, UserModel, REBATE_REASON_VALUES } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { areTagsVisible, coerceBoolean, debugFormErrors, debugFormModel, getFullName, hasRole, isOrg, isPerson } from '@bk2/shared-util-core';

import { MembershipI18n, membershipValidations } from '@bk2/relationship-membership-util';
import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-membership-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    AvatarPipe,
    TextInput, DateInput,
    Chips, NotesInput, CategorySelect, NumberInput, StringSelect,
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
                        <ion-button slot="start" fill="clear" (click)="selectMember()">{{ i18n().select() }}</ion-button>
                      </ion-item>
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="12">
                      <ion-item lines="none">
                        <ion-label>{{ i18n().new_desc() }}</ion-label>
                      </ion-item>
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="9">
                      <ion-item lines="none">
                        <ion-avatar slot="start" [style.background-color]="'var(--ion-color-light)'">
                          <ion-img src="{{ orgAvatar() | avatar:defaultIcon() }}" alt="Avatar Logo of Organization" />
                        </ion-avatar>
                        <ion-label>{{ orgName() }}</ion-label>
                      </ion-item>
                    </ion-col>
                    <ion-col size="3">
                      <ion-item lines="none">
                      <ion-button slot="start" fill="clear" (click)="selectOrg()">{{ i18n().select() }}</ion-button>
                      </ion-item>
                    </ion-col>
                  </ion-row>
                  <ion-row>
                    <ion-col size="12">
                      <bk-cat-select [category]="membershipCategories()" [selectedItemName]="currentMembershipCategoryItem()" (selectedItemNameChange)="onFieldChange('category', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12">
                      <bk-date-input [i18n]="dateOfEntryI18n()" [storeDate]="dateOfEntry()" (storeDateChange)="onFieldChange('dateOfEntry', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              } @else {
                <!-------------------------existing membership: category and state can not be changed here, only with separate methods ------------------------------>
                <ion-grid>
                  @if(hasRole('admin')) {
                    <ion-row>
                      <ion-col size="12" size-md="6">
                        <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <bk-date-input [i18n]="dateOfEntryI18n()" [storeDate]="dateOfEntry()" (storeDateChange)="onFieldChange('dateOfEntry', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>

                    @if(dateOfExit() && dateOfExit().length > 0 && dateOfExit() !== endFutureDate) {
                      <ion-col size="12" size-md="6">
                        <bk-date-input [i18n]="dateOfExitI18n()" [storeDate]="dateOfExit()" (storeDateChange)="onFieldChange('dateOfExit', $event)" [readOnly]="isReadOnly()" />
                      </ion-col>
                    }
                  </ion-row>
                  <ion-row>
                    <ion-col size="12" size-md="6">
                      <ion-item lines="none">
                        <ion-label>{{ i18n().category_label() }}:</ion-label>
                        <ion-label>{{ i18n().category_name() }}</ion-label>
                      </ion-item>
                      <ion-item lines="none">
                        <ion-note>{{ i18n().category_helper() }}</ion-note>
                      </ion-item>
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <ion-item lines="none">
                        <ion-label>{{ i18n().member_state_label() }}:</ion-label>
                        <ion-label>{{ membershipState() }}</ion-label>
                      </ion-item>
                      <ion-item lines="none">
                        <ion-note>{{ i18n().member_state_helper() }}</ion-note>
                      </ion-item>
                    </ion-col>

                    <ion-col size="12" size-md="6">
                      <bk-number-input [i18n]="rebateI18n()" [value]="rebate()" (valueChange)="onFieldChange('rebate', $event)" [maxLength]=6 [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <bk-string-select [i18n]="rebateReasonI18n()" [selectedString]="rebateReason()" (selectedStringChange)="onFieldChange('rebateReason', $event)" [readOnly]="readOnly()" [stringList]="rebateReasons" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              }

              <!--------------------------------------------------- properties --------------------------------------------------->
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="memberIdI18n()" [value]="memberId()" (valueChange)="onFieldChange('memberId', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="memberBexioIdI18n()" [value]="memberBexioId()" (valueChange)="onFieldChange('memberBexioId', $event)" [maxLength]=6 [mask]="bexioMask" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="memberAbbreviationI18n()" [value]="memberAbbreviation()" (valueChange)="onFieldChange('memberAbbreviation', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                  </ion-col>

                  @if(hasRole('memberAdmin')) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="memberNickNameI18n()" [value]="memberNickName()" (valueChange)="onFieldChange('memberNickName', $event)" [maxLength]=20 [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <bk-text-input [i18n]="orgFunctionI18n()" [value]="orgFunction()" (valueChange)="onFieldChange('orgFunction', $event)" [maxLength]=30 [readOnly]="isReadOnly()" />
                  </ion-col>
                  }
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>

          @if(areTagsVisible()) {
            <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
          }

          @if(hasRole('admin')) {
            <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
          }
        </form>
      }
  `
})
export class MembershipForm {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // i18n — all field translations come from the i18n input
  protected bkeyI18n = computed(() => ({ name: 'bkey', label: this.i18n().key(), placeholder: '', helper: '' }) as TextInputI18n);
  protected memberIdI18n = computed(() => ({ name: 'memberId', label: this.i18n().memberId_label(), placeholder: this.i18n().memberId_placeholder(), helper: this.i18n().memberId_helper() }) as TextInputI18n);
  protected memberBexioIdI18n = computed(() => ({ name: 'member_bexioid', label: this.i18n().bexioId_label(), placeholder: this.i18n().bexioId_placeholder(), helper: this.i18n().bexioId_helper() }) as TextInputI18n);
  protected memberAbbreviationI18n = computed(() => ({ name: 'memberAbbreviation', label: this.i18n().abbreviation_label(), placeholder: this.i18n().abbreviation_placeholder(), helper: this.i18n().abbreviation_helper() }) as TextInputI18n);
  protected memberNickNameI18n = computed(() => ({ name: 'memberNickName', label: this.i18n().nickName_label(), placeholder: this.i18n().nickName_placeholder(), helper: this.i18n().nickName_helper() }) as TextInputI18n);
  protected orgFunctionI18n = computed(() => ({ name: 'orgFunction', label: this.i18n().org_function_label(), placeholder: this.i18n().org_function_placeholder(), helper: this.i18n().org_function_helper() }) as TextInputI18n);
  protected rebateI18n = computed(() => ({ name: 'rebate', label: this.i18n().rebate_label(), placeholder: this.i18n().rebate_placeholder(), helper: this.i18n().rebate_helper() } as NumberInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected dateOfEntryI18n = computed(() => ({ name: 'dateOfEntry', label: this.i18n().dateOfEntry_label(), placeholder: this.i18n().dateOfEntry_placeholder(), helper: this.i18n().dateOfEntry_helper() } as DateInputI18n));
  protected dateOfExitI18n   = computed(() => ({ name: 'dateOfExit',   label: this.i18n().dateOfExit_label(),   placeholder: this.i18n().dateOfExit_placeholder(),   helper: this.i18n().dateOfExit_helper()   } as DateInputI18n));
  protected rebateReasonI18n = computed(() => ({ name: 'rebateReason', label: this.i18n().rebate_reason() } as StringSelectI18n));

  // inputs
  public readonly i18n = input.required<MembershipI18n>();
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
  protected defaultIcon = computed(() => this.formData().orgModelType);
  protected orgAvatar = computed(() => `${this.formData().orgModelType}.${this.orgKey()}`);
  protected orgName = linkedSignal(() => this.formData().orgName ?? '');
  protected memberId = computed(() => this.formData().memberId ?? DEFAULT_ID);
  protected dateOfEntry = linkedSignal(() => this.formData().dateOfEntry ?? DEFAULT_DATE);
  protected dateOfExit = linkedSignal(() => this.formData().dateOfExit ?? DEFAULT_DATE);
  protected currentMembershipCategoryItem = linkedSignal(() => this.formData().category ?? '');
  protected orgFunction = linkedSignal(() => this.formData().orgFunction ?? '');
  protected order = computed(() => this.formData().order ?? 0);
  protected relLog = computed(() => this.formData().relLog ?? '');
  protected relIsLast = computed(() => this.formData().relIsLast ?? true);
  protected rebate = linkedSignal(() => this.formData().rebate ?? 0);
  protected rebateReason = computed(() => this.formData().rebateReason ?? 'none');
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected membershipState = computed(() => this.formData().category ?? DEFAULT_MSTATE);
  protected i18nBase = computed(() => this.membershipCategories().i18n);
  protected name = computed(() => this.membershipCategories().name);
  protected readonly locale = linkedSignal(() => this.appStore.appConfig().locale);
  protected bkey = computed(() => this.formData().bkey ?? '');

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected endFutureDate = END_FUTURE_DATE_STR;
  protected rebateReasons = REBATE_REASON_VALUES;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    this.dirty.emit(true);
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
      component: PersonSelectModal,
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
        debugFormErrors('MembershipForm.selectPerson', this.validationResult().errors, this.currentUser());
      }
    }
  }

  protected async selectOrg(): Promise<void> {
    const modal = await this.modalController.create({
      component: OrgSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: 'all',
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
        debugFormErrors('MembershipForm.selectOrg', this.validationResult().errors, this.currentUser());
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected areTagsVisible(): boolean {
    return areTagsVisible(this.currentUser(), this.priv(), this.tags(), this.isReadOnly())  ;
  }
}
