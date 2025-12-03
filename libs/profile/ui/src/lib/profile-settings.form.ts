import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, inject, input, model, output, signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { AvatarUsages, DeliveryTypes, Languages, NameDisplays, PersonSortCriterias } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { AvatarUsage, DefaultLanguage, DeliveryType, NameDisplay, PersonSortCriteria, RoleName, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent, ErrorNoteComponent, TextInputComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, hasRole } from "@bk2/shared-util-core";

import { SETTINGS_FORM_SHAPE, SettingsFormModel, settingsFormValidations } from "@bk2/profile-util";

@Component({
  selector: 'bk-profile-settings-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    vestForms,
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryComponent, CheckboxComponent, TextInputComponent, ErrorNoteComponent,
  ],
  styles: [`
    ion-icon {
      padding-right: 5px;
    }
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-settings">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() | translate | async }}</ion-label>
    </ion-item>
    <div slot="content">
      <form scVestForm
          [formShape]="shape"
          [formValue]="formData()"
          [suite]="suite" 
          (dirtyChange)="dirty.emit($event)"
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
                <bk-cat name="language" [value]="language()" [categories]="languages" [readOnly]="isReadOnly()" (changed)="onFieldChange('language', $event)" />                                                             
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showDebugInfo" [isChecked]="showDebugInfo()" [showHelper]="showHelper()" [readOnly]="isReadOnly()" (changed)="onFieldChange('showDebugInfo', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showArchivedData" [isChecked]="showArchivedData()" [readOnly]="isReadOnly()" [showHelper]="showHelper()" (changed)="onFieldChange('showArchivedData', $event)" />
              </ion-col>
            }
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showHelpers" [isChecked]="showHelpers()" [showHelper]="showHelper()" [readOnly]="isReadOnly()" (changed)="onFieldChange('showHelpers', $event)" />
            </ion-col>
            @if(hasRole('admin')) {
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useTouchId" [isChecked]="useTouchId()" [showHelper]="showHelper()" [readOnly]="isReadOnly()" (changed)="onFieldChange('useTouchId', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useFaceId" [isChecked]="useFaceId()" [showHelper]="showHelper()" [readOnly]="isReadOnly()" (changed)="onFieldChange('useFaceId', $event)" />
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="avatarUsage" [value]="avatarUsage()" [categories]="avatarUsages" [readOnly]="isReadOnly()" [showHelper]="showHelper()" (changed)="onFieldChange('avatarUsage', $event)" />  
            </ion-col>
            @if(avatarUsage() === avatarUsageEnum.GravatarFirst || avatarUsage() === avatarUsageEnum.PhotoFirst) {
              <ion-col size="12" size-md="6">
                <bk-text-input name="gravatarEmail" [value]="gravatarEmail()" [showHelper]="showHelper()" [copyable]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('gravatarEmail', $event)" /> 
                <bk-error-note [errors]="gravatarEmailErrors()" />                                                 
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="nameDisplay" [value]="nameDisplay()" [categories]="nameDisplays" [readOnly]="isReadOnly()"  [showHelper]="showHelper()" (changed)="onFieldChange('nameDisplay', $event)"/>  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="personSortCriteria" [value]="personSortCriteria()" [categories]="personSortCriterias" [readOnly]="isReadOnly()" [showHelper]="showHelper()" (changed)="onFieldChange('personSortCriteria', $event)"/>  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="newsDelivery" [value]="newsDelivery()" [categories]="deliveryTypes" [readOnly]="isReadOnly()" [showHelper]="showHelper()" (changed)="onFieldChange('newsDelivery', $event)"/>  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="invoiceDelivery" [value]="invoiceDelivery()" [categories]="deliveryTypes" [readOnly]="isReadOnly()" [showHelper]="showHelper()" (changed)="onFieldChange('invoiceDelivery', $event)"/>  
            </ion-col>
          </ion-row>
        </ion-grid>
      </form>
    </div>
  </ion-accordion>
  `,
})
export class ProfileSettingsAccordionComponent {
  protected readonly modalController = inject(ModalController);

  // inputs
  public formData = model.required<SettingsFormModel>();
  public color = input('light'); // color of the accordion
  public title = input('@profile.settings.title'); // title of the accordion
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input<boolean>(true);
  public readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = settingsFormValidations;
  protected readonly shape = SETTINGS_FORM_SHAPE;
  private readonly validationResult = computed(() => settingsFormValidations(this.formData()));
  protected gravatarEmailErrors = computed(() => this.validationResult().getErrors('gravatarEmail'));
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // fields
  protected language = computed(() => this.formData().language ?? DefaultLanguage);
  protected showDebugInfo = computed(() => this.formData().showDebugInfo ?? false);
  protected showArchivedData = computed(() => this.formData().showArchivedData ?? false);
  protected showHelpers = computed(() => this.formData().showHelpers ?? true);
  protected useTouchId = computed(() => this.formData().useTouchId ?? false);
  protected useFaceId = computed(() => this.formData().useFaceId ?? false);
  protected avatarUsage = computed(() => this.formData().avatarUsage ?? AvatarUsage.PhotoFirst);
  protected gravatarEmail = computed(() => this.formData().gravatarEmail ?? '');
  protected nameDisplay = computed(() => this.formData().nameDisplay ?? NameDisplay.FirstLast);
  protected personSortCriteria = computed(() => this.formData().personSortCriteria ?? PersonSortCriteria.Fullname);
  protected useDisplayName = computed(() => this.formData().useDisplayName ?? false);
  protected newsDelivery = computed(() => this.formData().newsDelivery ?? DeliveryType.EmailAttachment);
  protected invoiceDelivery = computed(() => this.formData().invoiceDelivery ?? DeliveryType.EmailAttachment);

  // passing constants to template
  protected avatarUsages = AvatarUsages;
  protected avatarUsageEnum = AvatarUsage;
  protected nameDisplays = NameDisplays;
  protected personSortCriterias = PersonSortCriterias;
  protected deliveryTypes = DeliveryTypes;
  protected languages = Languages;
  
  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: SettingsFormModel): void {
    this.formData.update(vm => ({...vm, ...value}));
    debugFormErrors('ProfileSettings.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, value: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: value }));
    debugFormErrors('ProfileSettings', this.validationResult().errors, this.currentUser());
    // tbd: if language:   this.i18nService.setActiveLang(language);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
