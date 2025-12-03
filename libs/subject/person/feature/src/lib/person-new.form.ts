import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { AppStore, OrgSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, PrivacyAccessor, PrivacySettings, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategorySelectComponent, CheckboxComponent, ChipsComponent, DateInputComponent, EmailInputComponent, ErrorNoteComponent, NotesInputComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole, isOrg, isVisibleToUser } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';

import { PERSON_NEW_FORM_SHAPE, PersonNewFormModel, personNewFormValidations } from '@bk2/subject-person-util';
import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_URL } from '@bk2/shared-constants';

@Component({
  selector: 'bk-person-new-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    AvatarPipe, AsyncPipe, TranslatePipe,
    TextInputComponent, DateInputComponent, CategorySelectComponent, ChipsComponent, NotesInputComponent,
    ErrorNoteComponent, PhoneInputComponent, EmailInputComponent, CategorySelectComponent, CheckboxComponent,
    SwissCitySearchComponent,
    IonGrid, IonRow, IonCol, IonItem, IonAvatar, IonImg, IonButton, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  styles: [`ion-thumbnail { width: 30px; height: 30px; }`],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (formValueChange)="onFormChange($event)">

      <!-------------------------------------- PERSON ------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Angaben zur Person</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <bk-text-input name="firstName" [value]="firstName()" autocomplete="given-name" [readOnly]="isReadOnly()" [autofocus]="true" [maxLength]=30 (changed)="onFieldChange('firstName', $event)" />
                <bk-error-note [errors]="firstNameErrors()" />                                                                                                                                                            
              </ion-col>

              <ion-col size="12" size-md="6">
                <bk-text-input name="lastName" [value]="lastName()" autocomplete="family-name" [readOnly]="isReadOnly()" [maxLength]=30 (changed)="onFieldChange('lastName', $event)" />
                <bk-error-note [errors]="lastNameErrors()" />                                                                                                                                                            
              </ion-col>
            </ion-row>

            @if(isVisibleToUser(priv().showGender)) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-cat-select [category]="genders()!" selectedItemName="gender()" [readOnly]="isReadOnly()" (changed)="onFieldChange('gender', $event)" />
                </ion-col>
              </ion-row>
            }

            <!-- tbd: these role checks are currently only checking against the default
              they need to be extended to consider the settings of this person's user -->
            @if(isVisibleToUser(priv().showDateOfBirth) || isVisibleToUser(priv().showDateOfDeath)) {
              <ion-row>
                @if(isVisibleToUser(priv().showDateOfBirth)) {
                  <ion-col size="12" size-md="6"> 
                    <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" [locale]="locale()" [readOnly]="isReadOnly()" autocomplete="bday" [showHelper]=true (changed)="onFieldChange('dateOfBirth', $event)" />
                  </ion-col>
                }

                @if(isVisibleToUser(priv().showDateOfDeath)) {
                  <ion-col size="12" size-md="6">
                    <bk-date-input name="dateOfDeath"  [storeDate]="dateOfDeath()" [locale]="locale()" [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfDeath', $event)" />
                  </ion-col>
                }
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-------------------------------------- ADDRESSES ------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Adressen</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                <bk-text-input name="streetName" [value]="streetName()" autocomplete="street-address" [readOnly]="isReadOnly()" (changed)="onFieldChange('streetName', $event)" />
                <bk-error-note [errors]="streetNameErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="3">
                <bk-text-input name="streetNumber" [value]="streetNumber()" [readOnly]="isReadOnly()" (changed)="onFieldChange('streetNumber', $event)" />
                <bk-error-note [errors]="streetNumberErrors()" />                                                                                                                     
              </ion-col>
            </ion-row>

            <bk-swisscity-search (citySelected)="onCitySelected($event)" />

            <ion-row>
              <ion-col size="12" size-md="3">
                <bk-text-input name="countryCode" [value]="countryCode()" [readOnly]="isReadOnly()" (changed)="onFieldChange('countryCode', $event)" />
              </ion-col>
      
              <ion-col size="12" size-md="3">
                <bk-text-input name="zipCode" [value]="zipCode()" [readOnly]="isReadOnly()" (changed)="onFieldChange('zipCode', $event)" />
              </ion-col>
              
              <ion-col size="12" size-md="6">
                <bk-text-input name="city" [value]="city()" [readOnly]="isReadOnly()" (changed)="onFieldChange('city', $event)" />
              </ion-col>
            </ion-row>

            <ion-row>
              <ion-col size="12" size-md="6"> 
                <bk-phone [value]="phone()" [readOnly]="isReadOnly()" (changed)="onFieldChange('phone', $event)" />
                <bk-error-note [errors]="phoneErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email [value]="email()" [readOnly]="isReadOnly()" (changed)="onFieldChange('email', $event)" />
                <bk-error-note [errors]="emailErrors()" />                                                                                                                     
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="web" [value]="web()" [readOnly]="isReadOnly()" (changed)="onFieldChange('web', $event)" />
                <bk-error-note [errors]="webErrors()" />                                                                                                                     
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-------------------------------------- OTHER ------------------------------------->
      @if(isVisibleToUser(priv().showTaxId) || isVisibleToUser(priv().showBexioId)) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>Verschiedenes</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                @if(isVisibleToUser(priv().showTaxId)) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="ssnId" [value]="ssnId()" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [readOnly]="isReadOnly()" [copyable]=true (changed)="onFieldChange('ssnId', $event)" />                                        
                  </ion-col>
                }
                @if(isVisibleToUser(priv().showBexioId)) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('bexioId', $event)" />                                        
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      }

      <!-------------------------------------- MEMBERSHIP (optional) ------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Mitgliedschaft (optional)</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">                               
                <bk-checkbox name="shouldAddMembership" [isChecked]="shouldAddMembership()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('shouldAddMembership', $event)" />
              </ion-col>
            </ion-row>
            @if(shouldAddMembership()) {
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
                  <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('dateOfEntry', $event)" />
                </ion-col>      
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    
      @if(isVisibleToUser(priv().showTags)) {
            <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />
      }

      @if(isVisibleToUser(priv().showNotes)) {
            <bk-notes [value]="notes()" [readOnly]="isReadOnly()" (changed)="onFieldChange('notes', $event)" />
      }
    </form>
  `
})
export class PersonNewFormComponent {
  private readonly modalController = inject(ModalController)
  protected readonly appStore = inject(AppStore);

  // inputs
  public formData = model.required<PersonNewFormModel>();
  public membershipCategories = input.required<CategoryListModel>();
  public priv = input.required<PrivacySettings>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

 // validation and errors
  protected readonly suite = personNewFormValidations;
  protected readonly shape = PERSON_NEW_FORM_SHAPE;
  private readonly validationResult = computed(() => personNewFormValidations(this.formData()));
  protected firstNameErrors = computed(() => this.validationResult().getErrors('firstName'));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));
  protected streetNameErrors = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberErrors = computed(() => this.validationResult().getErrors('streetNumber'));
  protected phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected webErrors = computed(() => this.validationResult().getErrors('web'));

  // fields
  protected allTags = computed(() => this.appStore.getTags('person'));
  protected genders = computed(() => this.appStore.getCategory('gender'));
  protected currentUser = computed(() => this.appStore.currentUser());
  protected firstName = computed(() => this.formData().firstName ?? DEFAULT_NAME);
  protected lastName = computed(() => this.formData().lastName ?? DEFAULT_NAME);
  protected dateOfBirth = computed(() => this.formData().dateOfBirth ?? DEFAULT_DATE);
  protected dateOfDeath = computed(() => this.formData().dateOfDeath ?? DEFAULT_DATE);
  protected gender = computed(() => this.formData().gender ?? DEFAULT_GENDER);
  protected ssnId = computed(() => this.formData().ssnId ?? DEFAULT_ID);
  protected bexioId = computed(() => this.formData().bexioId ?? DEFAULT_ID);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  protected shouldAddMembership = computed(() => this.formData().shouldAddMembership ?? false);
  protected readonly locale = computed(() => this.appStore.appConfig().locale);

  // address
  protected streetName = computed(() => this.formData().streetName ?? DEFAULT_NAME);
  protected streetNumber = computed(() => this.formData().streetNumber ?? '');
  protected zipCode = computed(() => this.formData().zipCode ?? '');
  protected city = computed(() => this.formData().city ?? '');
  protected countryCode = computed(() => this.formData().countryCode ?? '');
  protected phone = computed(() => this.formData().phone ?? DEFAULT_PHONE);
  protected email = computed(() => this.formData().email ?? DEFAULT_EMAIL);
  protected web = computed(() => this.formData().web ?? DEFAULT_URL);

  // membership
  protected orgKey = computed(() => this.formData().orgKey ?? DEFAULT_KEY);
  protected orgName = computed(() => this.formData().orgName ?? DEFAULT_NAME);
  protected currentMembershipCategoryItem = computed(() => this.formData().membershipCategory ?? '');
  protected dateOfEntry = computed(() => this.formData().dateOfEntry ?? getTodayStr());

  // passing constants to template
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
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
        debugFormErrors('PersonNewForm.selectOrg', this.validationResult().errors, this.currentUser());
      }
    }
  }

  protected onCitySelected(city: SwissCity): void {
    this.formData.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
  }

  protected onCatChanged(membershipCategory: string): void {
    const membershipCategoryAbbreviation = this.membershipCategories().items.find(item => item.name === membershipCategory)?.abbreviation ?? 'A';
    this.formData.update((vm) => ({ ...vm, membershipCategory, membershipCategoryAbbreviation }));
    debugFormErrors('PersonNewForm.onCatChanged', this.validationResult().errors, this.currentUser());
  }

  protected onFormChange(value: PersonNewFormModel): void {
    this.formData.update((vm) => ({ ...vm, ...value }));
    debugFormErrors('PersonNewForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('PersonNewForm.onFieldChange', this.validationResult().errors, this.currentUser());
    debugFormModel<PersonNewFormModel>('PersonNewForm', this.formData(), this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected isVisibleToUser(privacyAccessor: PrivacyAccessor): boolean {
    return isVisibleToUser(privacyAccessor, this.currentUser());
  }
}
