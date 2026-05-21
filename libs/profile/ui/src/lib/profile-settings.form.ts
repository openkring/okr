import { Component, computed, inject, input, linkedSignal, model, output, signal } from "@angular/core";
import { IonAccordion, IonButton, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { AvatarUsages, DeliveryTypes, Languages, NameDisplays, PersonSortCriterias } from "@bk2/shared-categories";
import { AvatarUsage, DefaultLanguage, DeliveryType, NameDisplay, PersonSortCriteria, RoleName, UserModel } from "@bk2/shared-models";
import { FcmService } from "@bk2/shared-data-access";
import { I18nService } from "@bk2/shared-i18n";
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, ErrorNote, TextInput, TextInputI18n } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from "@bk2/shared-util-core";

import { userValidations } from "@bk2/user-util";
import { PFX } from "./scope";

export interface ProfileSettingsFormI18n {
  title: string;
  description: string;
}

@Component({
  selector: 'bk-profile-settings-accordion',
  standalone: true,
  imports: [
    vestForms,
    IonAccordion, IonButton, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryOld, Checkbox, TextInput, ErrorNote,
  ],
  styles: [`ion-icon { padding-right: 5px; }`],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-settings">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().title }}</ion-label>
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
                  <ion-label>{{ i18n().description }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row> 
              @if(hasRole('admin')) {
                <ion-col size="12">
                  <bk-category-old [i18n]="languageI18n()" [value]="language()" (valueChange)="onFieldChange('language', $event)"  [categories]="languages" [readOnly]="isReadOnly()" />                                                             
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="showDebugInfoI18n()" [checked]="showDebugInfo()" (checkedChange)="onFieldChange('showDebugInfo', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="showArchivedDataI18n()" [checked]="showArchivedData()" (checkedChange)="onFieldChange('showArchivedData', $event)" [readOnly]="isReadOnly()" [showHelper]="showHelper()" />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="showHelpersI18n()" [checked]="showHelpers()" (checkedChange)="onFieldChange('showHelpers', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
              </ion-col>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="useTouchIdI18n()" [checked]="useTouchId()" (checkedChange)="onFieldChange('useTouchId', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-checkbox [i18n]="useFaceIdI18n()" [checked]="useFaceId()" (checkedChange)="onFieldChange('useFaceId', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="avatarUsageI18n()" [value]="avatarUsage()" (valueChange)="onFieldChange('avatarUsage', $event)" [categories]="avatarUsages" [readOnly]="isReadOnly()" />  
              </ion-col>
              @if(avatarUsage() === avatarUsageEnum.GravatarFirst || avatarUsage() === avatarUsageEnum.PhotoFirst) {
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="gravatarEmailI18n()" [value]="gravatarEmail()" (valueChange)="onFieldChange('gravatarEmail', $event)" [showHelper]="showHelper()" [copyable]=true [readOnly]="isReadOnly()" />
                  <bk-error-note [errors]="gravatarEmailErrors()" />                                                 
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="nameDisplayI18n()" [value]="nameDisplay()" (valueChange)="onFieldChange('nameDisplay', $event)" [categories]="nameDisplays" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="personSortCriteriaI18n()" [value]="personSortCriteria()" (valueChange)="onFieldChange('personSortCriteria', $event)" [categories]="personSortCriterias" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="newsDeliveryI18n()" [value]="newsDelivery()" (valueChange)="onFieldChange('newsDelivery', $event)" [categories]="deliveryTypes" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-category-old [i18n]="invoiceDeliveryI18n()" [value]="invoiceDelivery()" (valueChange)="onFieldChange('invoiceDelivery', $event)" [categories]="deliveryTypes" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            @if (fcmService.isSupported()) {
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>
                      <h3>Push-Benachrichtigungen</h3>
                      @if (notificationPermission() === 'granted') {
                        <p style="color: var(--ion-color-success)">Aktiv</p>
                      } @else if (notificationPermission() === 'denied') {
                        <p style="color: var(--ion-color-danger)">Blockiert – Systemeinstellungen → Mitteilungen öffnen</p>
                      } @else {
                        <p>Aktivieren, um auch ausserhalb der App benachrichtigt zu werden.</p>
                      }
                    </ion-label>
                    @if (notificationPermission() !== 'denied') {
                      <ion-button slot="end" fill="outline" size="small" (click)="enableNotifications()">
                        {{ notificationPermission() === 'granted' ? 'Erneuern' : 'Aktivieren' }}
                      </ion-button>
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </form>
      }
    </div>
  </ion-accordion>
  `,
})
export class ProfileSettingsAccordion {
  protected readonly modalController = inject(ModalController);
  protected readonly fcmService = inject(FcmService);
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    gravatarEmail_label:        PFX + 'gravatarEmail.label',
    gravatarEmail_placeholder:  PFX + 'gravatarEmail.placeholder',
    gravatarEmail_helper:       PFX + 'gravatarEmail.helper',
    language_label:             PFX + 'language.label',
    avatarUsage_label:          PFX + 'avatarUsage.label',
    nameDisplay_label:          PFX + 'nameDisplay.label',
    personSortCriteria_label:   PFX + 'personSortCriteria.label',
    newsDelivery_label:         PFX + 'newsDelivery.label',
    invoiceDelivery_label:      PFX + 'invoiceDelivery.label',
    showDebugInfo_label:        PFX + 'showDebugInfo.label',
    showDebugInfo_helper:       PFX + 'showDebugInfo.helper',
    showArchivedData_label:     PFX + 'showArchivedData.label',
    showArchivedData_helper:    PFX + 'showArchivedData.helper',
    showHelpers_label:          PFX + 'showHelpers.label',
    showHelpers_helper:         PFX + 'showHelpers.helper',
    useTouchId_label:           PFX + 'useTouchId.label',
    useTouchId_helper:          PFX + 'useTouchId.helper',
    useFaceId_label:            PFX + 'useFaceId.label',
    useFaceId_helper:           PFX + 'useFaceId.helper',
  });
  protected gravatarEmailI18n = computed(() => ({
    name: 'gravatarEmail',
    label: this.fieldI18n.gravatarEmail_label(),
    placeholder: this.fieldI18n.gravatarEmail_placeholder(),
    helper: this.fieldI18n.gravatarEmail_helper(),
  } as TextInputI18n));
  protected languageI18n          = computed(() => ({ name: 'language',           label: this.fieldI18n.language_label()           } as CategoryOldI18n));
  protected avatarUsageI18n       = computed(() => ({ name: 'avatarUsage',        label: this.fieldI18n.avatarUsage_label()        } as CategoryOldI18n));
  protected nameDisplayI18n       = computed(() => ({ name: 'nameDisplay',        label: this.fieldI18n.nameDisplay_label()        } as CategoryOldI18n));
  protected personSortCriteriaI18n= computed(() => ({ name: 'personSortCriteria', label: this.fieldI18n.personSortCriteria_label() } as CategoryOldI18n));
  protected newsDeliveryI18n      = computed(() => ({ name: 'newsDelivery',       label: this.fieldI18n.newsDelivery_label()       } as CategoryOldI18n));
  protected invoiceDeliveryI18n   = computed(() => ({ name: 'invoiceDelivery',    label: this.fieldI18n.invoiceDelivery_label()   } as CategoryOldI18n));
  protected showDebugInfoI18n     = computed(() => ({ name: 'showDebugInfo',    label: this.fieldI18n.showDebugInfo_label(),    helper: this.fieldI18n.showDebugInfo_helper()    } as CheckboxI18n));
  protected showArchivedDataI18n  = computed(() => ({ name: 'showArchivedData', label: this.fieldI18n.showArchivedData_label(), helper: this.fieldI18n.showArchivedData_helper() } as CheckboxI18n));
  protected showHelpersI18n       = computed(() => ({ name: 'showHelpers',      label: this.fieldI18n.showHelpers_label(),      helper: this.fieldI18n.showHelpers_helper()      } as CheckboxI18n));
  protected useTouchIdI18n        = computed(() => ({ name: 'useTouchId',       label: this.fieldI18n.useTouchId_label(),       helper: this.fieldI18n.useTouchId_helper()       } as CheckboxI18n));
  protected useFaceIdI18n         = computed(() => ({ name: 'useFaceId',        label: this.fieldI18n.useFaceId_label(),        helper: this.fieldI18n.useFaceId_helper()        } as CheckboxI18n));

  protected notificationPermission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // inputs
  public readonly i18n = input<ProfileSettingsFormI18n>({ title: '', description: '' });
  public formData = model.required<UserModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('light'); // color of the accordion
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

  protected async enableNotifications(): Promise<void> {
    const uid = this.currentUser()?.bkey;
    if (!uid) return;
    await this.fcmService.registerAndSave(uid);
    if (typeof Notification !== 'undefined') {
      this.notificationPermission.set(Notification.permission);
    }
  }

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
