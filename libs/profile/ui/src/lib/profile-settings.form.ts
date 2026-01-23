import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, input, linkedSignal, model, output } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { AvatarUsages, DeliveryTypes, Languages, NameDisplays, PersonSortCriterias } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { AvatarUsage, DefaultLanguage, DeliveryType, NameDisplay, PersonSortCriteria, RoleName, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent, ErrorNoteComponent, TextInputComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from "@bk2/shared-util-core";

import { userValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-profile-settings-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    vestForms,
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryComponent, CheckboxComponent, TextInputComponent, ErrorNoteComponent,
  ],
  styles: [`ion-icon { padding-right: 5px; }`],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-settings">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() | translate | async }}</ion-label>
    </ion-item>
    <div slot="content">
      @if (showForm()) {
        <form scVestForm
            [formValue]="formData()"
            [suite]="suite" 
            (dirtyChange)="dirty.emit($event)"
            (validChange)="valid.emit($event)"
            (formValueChange)="onFormChange($event)">

          <ion-grid>        
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label>{{ '@profile.settings.description' | translate | async }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row> 
              @if(hasRole('admin')) {
                <ion-col size="12">
                  <bk-cat name="language" [value]="language()" (valueChange)="onFieldChange('language', $event)"  [categories]="languages" [readOnly]="isReadOnly()" />                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="showDebugInfo" [checked]="showDebugInfo()" (checkedChange)="onFieldChange('showDebugInfo', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="showArchivedData" [checked]="showArchivedData()" (checkedChange)="onFieldChange('showArchivedData', $event)" [readOnly]="isReadOnly()" [showHelper]="showHelper()" />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showHelpers" [checked]="showHelpers()" (checkedChange)="onFieldChange('showHelpers', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
              </ion-col>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="useTouchId" [checked]="useTouchId()" (checkedChange)="onFieldChange('useTouchId', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox name="useFaceId" [checked]="useFaceId()" (checkedChange)="onFieldChange('useFaceId', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat name="avatarUsage" [value]="avatarUsage()" (valueChange)="onFieldChange('avatarUsage', $event)" [categories]="avatarUsages" [readOnly]="isReadOnly()" [showHelper]="showHelper()" />  
              </ion-col>
              @if(avatarUsage() === avatarUsageEnum.GravatarFirst || avatarUsage() === avatarUsageEnum.PhotoFirst) {
                <ion-col size="12" size-md="6">
                  <bk-text-input name="gravatarEmail" [value]="gravatarEmail()" (valueChange)="onFieldChange('gravatarEmail', $event)" [showHelper]="showHelper()" [copyable]=true [readOnly]="isReadOnly()" /> 
                  <bk-error-note [errors]="gravatarEmailErrors()" />                                                 
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-cat name="nameDisplay" [value]="nameDisplay()" (valueChange)="onFieldChange('nameDisplay', $event)" [categories]="nameDisplays" [readOnly]="isReadOnly()"  [showHelper]="showHelper()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="personSortCriteria" [value]="personSortCriteria()" (valueChange)="onFieldChange('personSortCriteria', $event)" [categories]="personSortCriterias" [readOnly]="isReadOnly()" [showHelper]="showHelper()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="newsDelivery" [value]="newsDelivery()" (valueChange)="onFieldChange('newsDelivery', $event)" [categories]="deliveryTypes" [readOnly]="isReadOnly()" [showHelper]="showHelper()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="invoiceDelivery" [value]="invoiceDelivery()" (valueChange)="onFieldChange('invoiceDelivery', $event)" [categories]="deliveryTypes" [readOnly]="isReadOnly()" [showHelper]="showHelper()" />  
              </ion-col>
            </ion-row>
          </ion-grid>
        </form>
      }
    </div>
  </ion-accordion>
  `,
})
export class ProfileSettingsAccordionComponent {
  protected readonly modalController = inject(ModalController);

  // inputs
  public formData = model.required<UserModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('light'); // color of the accordion
  public title = input('@profile.settings.title'); // title of the accordion
  public readonly tenantId = input.required<string>();
  public readonly tags = input.required<string>();
  public readonly readOnly = input<boolean>(true);
  public readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userValidations;
  private readonly validationResult = computed(() => userValidations(this.formData(), this.tenantId(), this.tags()));
  protected gravatarEmailErrors = computed(() => this.validationResult().getErrors('gravatarEmail'));
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // fields
  protected language = linkedSignal(() => this.formData().userLanguage ?? DefaultLanguage);
  protected showDebugInfo = linkedSignal(() => this.formData().showDebugInfo ?? false);
  protected showArchivedData = linkedSignal(() => this.formData().showArchivedData ?? false);
  protected showHelpers = linkedSignal(() => this.formData().showHelpers ?? true);
  protected useTouchId = linkedSignal(() => this.formData().useTouchId ?? false);
  protected useFaceId = linkedSignal(() => this.formData().useFaceId ?? false);
  protected avatarUsage = linkedSignal(() => this.formData().avatarUsage ?? AvatarUsage.PhotoFirst);
  protected gravatarEmail = linkedSignal(() => this.formData().gravatarEmail ?? '');
  protected nameDisplay = linkedSignal(() => this.formData().nameDisplay ?? NameDisplay.FirstLast);
  protected personSortCriteria = linkedSignal(() => this.formData().personSortCriteria ?? PersonSortCriteria.Fullname);
  protected newsDelivery = linkedSignal(() => this.formData().newsDelivery ?? DeliveryType.EmailAttachment);
  protected invoiceDelivery = linkedSignal(() => this.formData().invoiceDelivery ?? DeliveryType.EmailAttachment);

  // passing constants to template
  protected avatarUsages = AvatarUsages;
  protected avatarUsageEnum = AvatarUsage;
  protected nameDisplays = NameDisplays;
  protected personSortCriterias = PersonSortCriterias;
  protected deliveryTypes = DeliveryTypes;
  protected languages = Languages;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, value: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: value }));
    // tbd: if language:   this.i18nService.setActiveLang(language);
  }

  protected onFormChange(value: UserModel): void {
    this.formData.update(vm => ({...vm, ...value}));
    debugFormModel('ProfileSettings.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('ProfileSettings.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
