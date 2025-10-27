import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonImg, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { GenderTypes } from '@bk2/shared-categories';
import { BexioIdMask, ChSsnMask } from '@bk2/shared-config';
import { AppStore, OrgSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, GenderType, ModelType, PrivacyAccessor, PrivacySettings, RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CategoryComponent, CategorySelectComponent, CheckboxComponent, ChipsComponent, DateInputComponent, EmailInputComponent, ErrorNoteComponent, NotesInputComponent, PhoneInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, debugFormModel, getTodayStr, hasRole, isOrg, isVisibleToUser } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SwissCitySearchComponent } from '@bk2/subject-swisscities-ui';

import { PersonNewFormModel, personNewFormModelShape, personNewFormValidations } from '@bk2/subject-person-util';

@Component({
  selector: 'bk-person-new-form',
  standalone: true,
  imports: [
    vestForms,
    FormsModule,
    AvatarPipe, AsyncPipe, TranslatePipe,
    TextInputComponent, DateInputComponent, CategoryComponent, ChipsComponent, NotesInputComponent,
    ErrorNoteComponent, PhoneInputComponent, EmailInputComponent, CategorySelectComponent, CheckboxComponent,
    SwissCitySearchComponent,
    IonGrid, IonRow, IonCol, IonItem, IonAvatar, IonImg, IonButton, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
    <form scVestForm
    [formShape]="shape"
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

    <!-------------------------------------- PERSON ------------------------------------->
    <ion-card>
      <ion-card-header>
        <ion-card-title>Angaben zur Person</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-text-input name="firstName" [value]="firstName()" autocomplete="given-name" [autofocus]="true" [maxLength]=30 (changed)="onChange('firstName', $event)" />
              <bk-error-note [errors]="firstNameErrors()" />                                                                                                                                                            
            </ion-col>

            <ion-col size="12" size-md="6">
              <bk-text-input name="lastName" [value]="lastName()" autocomplete="family-name" [maxLength]=30 (changed)="onChange('lastName', $event)" />
              <bk-error-note [errors]="lastNameErrors()" />                                                                                                                                                            
            </ion-col>
          </ion-row>

          @if(isVisibleToUser(priv().showGender)) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat name="gender" [value]="gender()" [categories]="genderTypes" (changed)="onChange('gender', $event)" />
              </ion-col>
            </ion-row>
          }

          <!-- tbd: these role checks are currently only checking against the default
            they need to be extended to consider the settings of this person's user -->
          @if(isVisibleToUser(priv().showDateOfBirth) || isVisibleToUser(priv().showDateOfDeath)) {
            <ion-row>
              @if(isVisibleToUser(priv().showDateOfBirth)) {
                <ion-col size="12" size-md="6"> 
                  <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" [locale]="locale()" autocomplete="bday" [showHelper]=true (changed)="onChange('dateOfBirth', $event)" />
                </ion-col>
              }

              @if(isVisibleToUser(priv().showDateOfDeath)) {
                <ion-col size="12" size-md="6">
                  <bk-date-input name="dateOfDeath"  [storeDate]="dateOfDeath()" [locale]="locale()" (changed)="onChange('dateOfDeath', $event)" />
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
              <bk-text-input name="streetName" [value]="streetName()" autocomplete="street-address" (changed)="onChange('streetName', $event)" />
              <bk-error-note [errors]="streetNameErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="3">
              <bk-text-input name="streetNumber" [value]="streetNumber()" (changed)="onChange('streetNumber', $event)" />
              <bk-error-note [errors]="streetNumberErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>

          <bk-swisscity-search (citySelected)="onCitySelected($event)" />

          <ion-row>
            <ion-col size="12" size-md="3">
              <bk-text-input name="countryCode" [value]="countryCode()" (changed)="onChange('countryCode', $event)" />
            </ion-col>
    
            <ion-col size="12" size-md="3">
              <bk-text-input name="zipCode" [value]="zipCode()" (changed)="onChange('zipCode', $event)" />
            </ion-col>
            
            <ion-col size="12" size-md="6">
              <bk-text-input name="city" [value]="city()" (changed)="onChange('city', $event)" />
            </ion-col>
          </ion-row>

          <ion-row>
            <ion-col size="12" size-md="6"> 
              <bk-phone [value]="phone()" (changed)="onChange('phone', $event)" />
              <bk-error-note [errors]="phoneErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-email [value]="email()" (changed)="onChange('email', $event)" />
              <bk-error-note [errors]="emailErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input name="web" [value]="web()" (changed)="onChange('web', $event)" />
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
                  <bk-text-input name="ssnId" [value]="ssnId()" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true (changed)="onChange('ssnId', $event)" />                                        
                </ion-col>
              }
              @if(isVisibleToUser(priv().showBexioId)) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="bexioId" [value]="bexioId()" [maxLength]=6 [mask]="bexioMask" [showHelper]=true (changed)="onChange('bexioId', $event)" />                                        
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
              <bk-checkbox name="shouldAddMembership" [isChecked]="shouldAddMembership()" [showHelper]="true" (changed)="onChange('shouldAddMembership', $event)" />
            </ion-col>
          </ion-row>
          @if(shouldAddMembership()) {
            <ion-row>
              <ion-col size="9">
                <ion-item lines="none">
                  <ion-avatar slot="start">
                    <ion-img src="{{ modelType.Org + '.' + orgKey() | avatar | async }}" alt="Avatar Logo of Organization" />
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
                <bk-cat-select [category]="membershipCategories()" popoverId="mcat-new" [selectedItemName]="currentMembershipCategoryItem()" (changed)="onCatChanged($event)" />
              </ion-col>
              <ion-col size="12"> 
                <bk-date-input name="dateOfEntry" [storeDate]="dateOfEntry()" [showHelper]=true (changed)="onChange('dateOfEntry', $event)" />
              </ion-col>      
            </ion-row>
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>
    
    @if(isVisibleToUser(priv().showTags)) {
          <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="personTags()" (changed)="onChange('tags', $event)" />
    }

    @if(isVisibleToUser(priv().showNotes)) {
          <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
    }
  </form>
  `
})
export class PersonNewFormComponent {
  private readonly modalController = inject(ModalController)
  protected readonly appStore = inject(AppStore);

  public vm = model.required<PersonNewFormModel>();
  public currentUser = input<UserModel | undefined>();
  public membershipCategories = input.required<CategoryListModel>();
  public personTags = input.required<string>();
  public priv = input.required<PrivacySettings>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);

  protected firstName = computed(() => this.vm().firstName ?? '');
  protected lastName = computed(() => this.vm().lastName ?? '');
  protected dateOfBirth = computed(() => this.vm().dateOfBirth ?? '');
  protected dateOfDeath = computed(() => this.vm().dateOfDeath ?? '');
  protected gender = computed(() => this.vm().gender ?? GenderType.Male);
  protected ssnId = computed(() => this.vm().ssnId ?? '');
  protected bexioId = computed(() => this.vm().bexioId ?? '');
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');
  protected shouldAddMembership = computed(() => this.vm().shouldAddMembership ?? false);
  protected readonly locale = computed(() => this.appStore.appConfig().locale);

  // address
  protected streetName = computed(() => this.vm().streetName ?? '');
  protected streetNumber = computed(() => this.vm().streetNumber ?? '');
  protected zipCode = computed(() => this.vm().zipCode ?? '');
  protected city = computed(() => this.vm().city ?? '');
  protected countryCode = computed(() => this.vm().countryCode ?? '');
  protected phone = computed(() => this.vm().phone ?? '');
  protected email = computed(() => this.vm().email ?? '');
  protected web = computed(() => this.vm().web ?? '');

  // membership
  protected orgKey = computed(() => this.vm().orgKey ?? '');
  protected orgName = computed(() => this.vm().orgName ?? '');
  protected currentMembershipCategoryItem = computed(() => this.vm().membershipCategory ?? '');
  protected dateOfEntry = computed(() => this.vm().dateOfEntry ?? getTodayStr());

  protected readonly suite = personNewFormValidations;
  protected readonly shape = personNewFormModelShape;
  private readonly validationResult = computed(() => personNewFormValidations(this.vm()));
  protected firstNameErrors = computed(() => this.validationResult().getErrors('firstName'));
  protected lastNameErrors = computed(() => this.validationResult().getErrors('lastName'));
  protected streetNameErrors = computed(() => this.validationResult().getErrors('streetName'));
  protected streetNumberErrors = computed(() => this.validationResult().getErrors('streetNumber'));
  protected phoneErrors = computed(() => this.validationResult().getErrors('phone'));
  protected emailErrors = computed(() => this.validationResult().getErrors('email'));
  protected webErrors = computed(() => this.validationResult().getErrors('web'));

  protected GT = GenderType;
  protected genderTypes = GenderTypes;
  protected modelType = ModelType;
  protected bexioMask = BexioIdMask;
  protected ssnMask = ChSsnMask;

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

  protected onCitySelected(city: SwissCity): void {
    this.vm.update((_vm) => ({ ..._vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
  }

  protected onCatChanged(membershipCategory: string): void {
    const membershipCategoryAbbreviation = this.membershipCategories().items.find(item => item.name === membershipCategory)?.abbreviation ?? 'A';
    this.vm.update((_vm) => ({ ..._vm, membershipCategory, membershipCategoryAbbreviation }));
    debugFormErrors('PersonNewForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onValueChange(value: PersonNewFormModel): void {
    this.vm.update((_vm) => ({ ..._vm, ...value }));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('PersonNewForm', this.validationResult().errors, this.currentUser());
    debugFormModel<PersonNewFormModel>('PersonNewForm', this.vm(), this.currentUser());

    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected isVisibleToUser(privacyAccessor: PrivacyAccessor): boolean {
    return isVisibleToUser(privacyAccessor, this.currentUser());
  }
}
