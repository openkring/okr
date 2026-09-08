import { Component, computed, effect, inject, input, linkedSignal, model, output, signal } from "@angular/core";
import { IonAccordion, IonButton, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";

import { AvatarUsages, LanguageCategory, Languages, NameDisplays, PersonSortCriterias } from "@okr/shared-categories";
import { AvatarUsage, DefaultLanguage, DeliveryChannel, NameDisplay, PersonSortCriteria, RoleName, UserModel } from "@okr/shared-models";
import { FcmService } from "@okr/shared-data-access";
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, DeliveryChannelsControl, DeliveryChannelsI18n, ErrorNote, TextInput, TextInputI18n } from "@okr/shared-ui";
import { coerceBoolean, hasRole, isValidForFields, toDeliveryChannels } from "@okr/shared-util-core";

import { userValidations } from "@okr/user-util";
import { ProfileI18n } from "@okr/profile-util";

/** The user fields this accordion renders as editable — the ones its `valid` output may gate on. */
const EDITED_FIELDS = [
  'userLanguage', 'showDebugInfo', 'showArchivedData', 'showHelpers', 'useTouchId', 'useFaceId',
  'avatarUsage', 'gravatarEmail', 'nameDisplay', 'personSortCriteria', 'newsDelivery', 'invoiceDelivery',
];

@Component({
  selector: 'okr-profile-settings-accordion',
  standalone: true,
  imports: [
    IonAccordion, IonButton, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryOld, Checkbox, TextInput, ErrorNote, DeliveryChannelsControl,
  ],
  styles: [`ion-icon { padding-right: 5px; }`],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-settings">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().settings_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      @if (showForm()) {
        <form novalidate>

          <ion-grid>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label>{{ i18n().settings_description() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row> 
              @if(hasRole('registered') && languages().length > 1) {
                <ion-col size="12">
                  <okr-category-old [i18n]="languageI18n()" [value]="language()" (valueChange)="onFieldChange('userLanguage', $event)"  [categories]="languages()" [readOnly]="isReadOnly()" />
                </ion-col>
              }
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showDebugInfoI18n()" [checked]="showDebugInfo()" (checkedChange)="onFieldChange('showDebugInfo', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showArchivedDataI18n()" [checked]="showArchivedData()" (checkedChange)="onFieldChange('showArchivedData', $event)" [readOnly]="isReadOnly()" [showHelper]="showHelper()" />
                </ion-col>
              }
              <ion-col size="12" size-md="6">
                <okr-checkbox [i18n]="showHelpersI18n()" [checked]="showHelpers()" (checkedChange)="onFieldChange('showHelpers', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
              </ion-col>
              @if(hasRole('admin')) {
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="useTouchIdI18n()" [checked]="useTouchId()" (checkedChange)="onFieldChange('useTouchId', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="useFaceIdI18n()" [checked]="useFaceId()" (checkedChange)="onFieldChange('useFaceId', $event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="avatarUsageI18n()" [value]="avatarUsage()" (valueChange)="onFieldChange('avatarUsage', $event)" [categories]="avatarUsages" [readOnly]="isReadOnly()" />  
              </ion-col>
              @if(avatarUsage() === avatarUsageEnum.GravatarFirst || avatarUsage() === avatarUsageEnum.PhotoFirst) {
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="gravatarEmailI18n()" [value]="gravatarEmail()" (valueChange)="onFieldChange('gravatarEmail', $event)" [showHelper]="showHelper()" [copyable]=true [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="gravatarEmailErrors()" />                                                 
                </ion-col>
              }
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="nameDisplayI18n()" [value]="nameDisplay()" (valueChange)="onFieldChange('nameDisplay', $event)" [categories]="nameDisplays" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="personSortCriteriaI18n()" [value]="personSortCriteria()" (valueChange)="onFieldChange('personSortCriteria', $event)" [categories]="personSortCriterias" [readOnly]="isReadOnly()" />  
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-delivery-channels [i18n]="newsDeliveryI18n()" [value]="newsDelivery()" (valueChange)="onFieldChange('newsDelivery', $event)" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="newsDeliveryErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-delivery-channels [i18n]="invoiceDeliveryI18n()" [value]="invoiceDelivery()" (valueChange)="onFieldChange('invoiceDelivery', $event)" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="invoiceDeliveryErrors()" />
              </ion-col>
            </ion-row>
            @if (fcmService.isSupported()) {
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>
                      <h3>{{ i18n().push_title() }}</h3>
                      @if (notificationPermission() === 'granted') {
                        <p style="color: var(--ion-color-success)">{{ i18n().push_active() }}</p>
                      } @else if (notificationPermission() === 'denied') {
                        <p style="color: var(--ion-color-danger)">{{ i18n().push_blocked() }}</p>
                      } @else {
                        <p>{{ i18n().push_hint() }}</p>
                      }
                    </ion-label>
                    @if (notificationPermission() !== 'denied') {
                      <ion-button slot="end" fill="outline" size="small" (click)="enableNotifications()">
                        {{ notificationPermission() === 'granted' ? i18n().push_renew() : i18n().push_enable() }}
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
  protected gravatarEmailI18n = computed(() => ({
    name: 'gravatarEmail',
    label: this.i18n().gravatar_label(),
    placeholder: this.i18n().gravatar_placeholder(),
    helper: this.i18n().gravatar_helper(),
  } as TextInputI18n));
  protected languageI18n          = computed(() => ({ name: 'language',           label: this.i18n().language_label()           } as CategoryOldI18n));
  protected avatarUsageI18n       = computed(() => ({ name: 'avatarUsage',        label: this.i18n().avatar_usage()             } as CategoryOldI18n));
  protected nameDisplayI18n       = computed(() => ({ name: 'nameDisplay',        label: this.i18n().name_display_label()       } as CategoryOldI18n));
  protected personSortCriteriaI18n= computed(() => ({ name: 'personSortCriteria', label: this.i18n().sort_person_label()        } as CategoryOldI18n));
  protected channelLabels = computed(() => ({
    post:  this.i18n().deliveryChannel_post(),
    email: this.i18n().deliveryChannel_email(),
    chat:  this.i18n().deliveryChannel_chat(),
  }));
  protected newsDeliveryI18n = computed(() => ({
    name: 'newsDelivery', label: this.i18n().deliver_news_label(), helper: this.i18n().deliver_news_helper(), channels: this.channelLabels(),
  } as DeliveryChannelsI18n));
  protected invoiceDeliveryI18n = computed(() => ({
    name: 'invoiceDelivery', label: this.i18n().deliver_invoice_label(), helper: this.i18n().deliver_invoice_helper(), channels: this.channelLabels(),
  } as DeliveryChannelsI18n));
  protected showDebugInfoI18n     = computed(() => ({ name: 'showDebugInfo',    label: this.i18n().show_debug_label(),    helper: this.i18n().show_debug_helper()    } as CheckboxI18n));
  protected showArchivedDataI18n  = computed(() => ({ name: 'showArchivedData', label: this.i18n().show_archived_label(), helper: this.i18n().show_archived_helper() } as CheckboxI18n));
  protected showHelpersI18n       = computed(() => ({ name: 'showHelpers',      label: this.i18n().show_helpers_label(),  helper: this.i18n().show_helpers_helper()  } as CheckboxI18n));
  protected useTouchIdI18n        = computed(() => ({ name: 'useTouchId',       label: this.i18n().use_touchid_label(),   helper: this.i18n().use_touchid_helper()   } as CheckboxI18n));
  protected useFaceIdI18n         = computed(() => ({ name: 'useFaceId',        label: this.i18n().use_faceid_label(),    helper: this.i18n().use_faceid_helper()    } as CheckboxI18n));

  protected notificationPermission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  public formData = model.required<UserModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('light'); // color of the accordion
  public readonly tenantId = input.required<string>();
  public readonly tags = input.required<string>();
  public readonly readOnly = input<boolean>(true);
  public readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly languages = input<LanguageCategory[]>(Languages);

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  // The streamed UserModel can still hold a legacy NUMBER in the two delivery fields (Firestore
  // reads skip model defaults, and the migration runs after the release). Validating the raw
  // value would fail `notArray` for every un-migrated user and hide the save bar with nothing
  // on screen to explain it — so validate a normalised copy.
  private readonly validatedData = computed<UserModel>(() => ({
    ...this.formData(),
    newsDelivery: this.asChannels(this.formData().newsDelivery),
    invoiceDelivery: this.asChannels(this.formData().invoiceDelivery),
  }));
  private readonly validationResult = computed(() => userValidations(this.validatedData(), this.tenantId(), this.tags()));
  protected gravatarEmailErrors = computed(() => this.validationResult().getErrors('gravatarEmail'));
  protected newsDeliveryErrors = computed(() => this.validationResult().getErrors('newsDelivery'));
  protected invoiceDeliveryErrors = computed(() => this.validationResult().getErrors('invoiceDelivery'));
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
  // Lastname, to match UserModel's default and convertUserToForm() — showing Fullname here made the
  // picker disagree with the order the list actually used.
  protected personSortCriteria = linkedSignal(() => this.formData().personSortCriteria ?? PersonSortCriteria.Lastname);
  protected newsDelivery = linkedSignal(() => this.asChannels(this.formData().newsDelivery));
  protected invoiceDelivery = linkedSignal(() => this.asChannels(this.formData().invoiceDelivery));

  // passing constants to template
  protected avatarUsages = AvatarUsages;
  protected avatarUsageEnum = AvatarUsage;
  protected nameDisplays = NameDisplays;
  protected personSortCriterias = PersonSortCriterias;

  constructor() {
    // The user suite also validates fields this accordion never shows (index, loginEmail,
    // personKey, tags); an error there must not silently disable the save — see isValidForFields.
    effect(() => this.valid.emit(isValidForFields(this.validationResult(), EDITED_FIELDS)));
  }

  protected async enableNotifications(): Promise<void> {
    const uid = this.currentUser()?.okey;
    if (!uid) return;
    await this.fcmService.registerAndSave(uid, true); // user gesture → allowed to prompt
    if (typeof Notification !== 'undefined') {
      this.notificationPermission.set(Notification.permission);
    }
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, value: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    // A legacy number must never be written back unchanged: normalise both delivery fields on
    // every edit, then let the edited field win.
    this.formData.update(vm => ({
      ...vm,
      newsDelivery: this.asChannels(vm.newsDelivery),
      invoiceDelivery: this.asChannels(vm.invoiceDelivery),
      [fieldName]: value,
    }));
    // Language is applied centrally: on save the user doc re-streams and AppStore's
    // language effect calls i18nService.setActiveLang() — no per-field call needed here.
  }

  /******************************* helpers *************************************** */
  /**
   * Legacy values are converted, an already migrated list is passed through UNCHANGED — an
   * empty one included, because that is the state the validation error above is meant to
   * report (toDeliveryChannels would silently replace it with the default).
   */
  private asChannels(raw: unknown): DeliveryChannel[] {
    return Array.isArray(raw) ? (raw as DeliveryChannel[]) : toDeliveryChannels(raw);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
