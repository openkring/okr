import { Component, computed, effect, input, linkedSignal, model, output, Signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { AvatarUsages, DeliveryTypes, Languages, NameDisplays, PersonSortCriterias } from "@bk2/shared-categories";
import { AvatarUsage, DeliveryType, Language, NameDisplay, UserModel } from "@bk2/shared-models";
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";

import { USER_DISPLAY_FORM_SHAPE, UserDisplayFormModel, userDisplayFormValidations, UserI18n } from "@bk2/user-util";

@Component({
  selector: 'bk-user-display-form',
  standalone: true,
  imports: [
    vestForms,
    CategoryOld, Checkbox,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonCardSubtitle, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  viewProviders: [vestFormsViewProviders],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (formValueChange)="onFormChange($event)">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().display_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().display_description() }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">                                                             
                <bk-category-old [i18n]="avatarUsageI18n()" [value]="avatarUsage()" (valueChange)="onFieldChange('avatarUsage', $event)" [categories]="avatarUsages" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="personSortCriteriaI18n()" [value]="personSortCriteria()" (valueChange)="onFieldChange('personSortCriteria', $event)" [categories]="personSortCriterias"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="userLanguageI18n()" [value]="userLanguage()" (valueChange)="onFieldChange('userLanguage', $event)" [categories]="languages" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="nameDisplayI18n()" [value]="nameDisplay()" (valueChange)="onFieldChange('nameDisplay', $event)" [categories]="nameDisplays" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="showArchivedDataI18n()" [checked]="showArchivedData()" (checkedChange)="onFieldChange('showArchivedData', $event)" [showHelper]="showHelpers()"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="showDebugInfoI18n()" [checked]="showDebugInfo()" (checkedChange)="onFieldChange('showDebugInfo', $event)" [showHelper]="showHelpers()"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="showHelpersI18n()" [checked]="showHelpers()" (checkedChange)="onFieldChange('showHelpers', $event)" [showHelper]="showHelpers()"  [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserDisplayForm {
  protected avatarUsageI18n        = computed(() => ({ name: 'avatarUsage',        label: this.i18n().avatarUsage_label()        } as CategoryOldI18n));
  protected personSortCriteriaI18n = computed(() => ({ name: 'personSortCriteria', label: this.i18n().personSortCriteria_label() } as CategoryOldI18n));
  protected userLanguageI18n       = computed(() => ({ name: 'userLanguage',       label: this.i18n().userLanguage_label()       } as CategoryOldI18n));
  protected nameDisplayI18n        = computed(() => ({ name: 'nameDisplay',        label: this.i18n().nameDisplay_label()        } as CategoryOldI18n));
  protected showArchivedDataI18n   = computed(() => ({ name: 'showArchivedData', label: this.i18n().showArchivedData_label(), helper: this.i18n().showArchivedData_helper() } as CheckboxI18n));
  protected showDebugInfoI18n      = computed(() => ({ name: 'showDebugInfo',    label: this.i18n().showDebugInfo_label(),    helper: this.i18n().showDebugInfo_helper()    } as CheckboxI18n));
  protected showHelpersI18n        = computed(() => ({ name: 'showHelpers',      label: this.i18n().showHelpers_label(),      helper: this.i18n().showHelpers_helper()      } as CheckboxI18n));

  // inputs
  public readonly i18n = input.required<UserI18n>();
  public formData = model.required<UserDisplayFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = userDisplayFormValidations;
  protected readonly shape = USER_DISPLAY_FORM_SHAPE;
  private readonly validationResult = computed(() => userDisplayFormValidations(this.formData()));

  // fields
  protected avatarUsage = linkedSignal(() => this.formData().avatarUsage);
  protected personSortCriteria = linkedSignal(() => this.formData().personSortCriteria);
  protected userLanguage = linkedSignal(() => this.formData().userLanguage);
  protected nameDisplay = linkedSignal(() => this.formData().nameDisplay);
  protected showArchivedData = linkedSignal(() => this.formData().showArchivedData);
  protected showDebugInfo = linkedSignal(() => this.formData().showDebugInfo);
  protected showHelpers = linkedSignal(() => this.formData().showHelpers);

  // passing constants to template
  protected readonly deliveryTypes = DeliveryTypes;
  protected readonly DT = DeliveryType;
  protected readonly avatarUsages = AvatarUsages;
  protected readonly personSortCriterias = PersonSortCriterias;
  protected readonly languages = Languages;
  protected readonly nameDisplays = NameDisplays;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: UserDisplayFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('UserDisplayForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: boolean | AvatarUsage | Language | NameDisplay): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserDisplayForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }}
