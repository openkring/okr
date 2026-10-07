import { Component, computed, effect, input, model, output } from "@angular/core";
import { form } from "@angular/forms/signals";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";

import { PhotoUsages, PrivacyUsages } from "@okr/shared-categories";
import { PrivacyUsage, UserModel } from "@okr/shared-models";
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, ErrorNote } from "@okr/shared-ui";
import { validateVestTree, vestErrors } from "@okr/shared-util-angular";
import { coerceBoolean } from "@okr/shared-util-core";

import { PersonFormModel, personValidations } from "@okr/subject-person-util";
import { ProfileI18n } from "@okr/profile-util";

/** The person fields this accordion renders as editable — the ones its `valid` output may gate on. */
const EDITED_FIELDS = ['usageImages', 'usageDateOfBirth', 'usagePostalAddress', 'usageEmail', 'usagePhone', 'usageName'];

@Component({
  selector: 'okr-profile-privacy-accordion',
  standalone: true,
  imports: [
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryOld, Checkbox, ErrorNote
  ],
  styles: [`
    ion-icon { padding-right: 5px; }
    @media (width <= 600px) { ion-card { margin: 5px;}}
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-privacy">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().privacy_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      @if (showForm()) {
        <form novalidate>

          <ion-grid>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label>{{ i18n().privacy_description() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row> 
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="usageImagesI18n()" [value]="usageImages()" (valueChange)="onUsageChange('usageImages', $event)" [categories]="photoUsages" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="usageImagesErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="usageDateOfBirthI18n()" [value]="usageDateOfBirth()" (valueChange)="onUsageChange('usageDateOfBirth', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="usageDateOfBirthErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="usagePostalAddressI18n()" [value]="usagePostalAddress()" (valueChange)="onUsageChange('usagePostalAddress', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="usagePostalAddressErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="usageEmailI18n()" [value]="usageEmail()" (valueChange)="onUsageChange('usageEmail', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="usageEmailErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="usagePhoneI18n()" [value]="usagePhone()" (valueChange)="onUsageChange('usagePhone', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="usagePhoneErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="usageNameI18n()" [value]="usageName()" (valueChange)="onUsageChange('usageName', $event)" [categories]="privacyUsages" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="usageNameErrors()" />
              </ion-col>
            </ion-row>
            @if(isScs()) {
              <ion-row>
                <ion-col>
                  <ion-item lines="none">
                    <ion-label>{{ i18n().usage_srv_info() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col>
                  <okr-checkbox [i18n]="srvEmailI18n()" [checked]="srvEmail()" (checkedChange)="onSrvEmailChange($event)" [showHelper]="showHelper()" [readOnly]="isReadOnly()" />
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
export class ProfilePrivacyAccordion {
  // usageImages is a declaration, not an access control (D-P4-10): it is worded for photos and
  // carries a helper that says so, because the app cannot enforce it and must not imply that it does.
  protected usageImagesI18n        = computed(() => ({ name: 'usageImages',        label: this.i18n().usage_images(), helper: this.i18n().usage_images_helper() } as CategoryOldI18n));
  protected usageDateOfBirthI18n   = computed(() => ({ name: 'usageDateOfBirth',   label: this.i18n().usage_dob()     } as CategoryOldI18n));
  protected usagePostalAddressI18n = computed(() => ({ name: 'usagePostalAddress', label: this.i18n().usage_postal()  } as CategoryOldI18n));
  protected usageEmailI18n         = computed(() => ({ name: 'usageEmail',         label: this.i18n().usage_email()   } as CategoryOldI18n));
  protected usagePhoneI18n         = computed(() => ({ name: 'usagePhone',         label: this.i18n().usage_phone()   } as CategoryOldI18n));
  protected usageNameI18n          = computed(() => ({ name: 'usageName',          label: this.i18n().usage_name()    } as CategoryOldI18n));
  protected srvEmailI18n           = computed(() => ({ name: 'srvEmail', label: this.i18n().usage_srv_label(), helper: this.i18n().usage_srv_helper() } as CheckboxI18n));

  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  // the privacy preferences (usage*) live on the person, which is the tenant-readable
  // source for AppStore.getPersonPrivacySettings — edit them directly here.
  public personFormData = model.required<PersonFormModel>();
  // the user still carries the legacy srvEmail flag (not present on the person).
  public formData = model.required<UserModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('primary'); // color of the accordion
  public readonly tenantId = input.required<string>();
  public readonly tags = input.required<string>();
  public readonly readOnly = input<boolean>(true);
  public readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // usage* validity comes from the person, so the signal form wraps personFormData. The suite
  // needs tenantId and tags, which validateVestTree does not pass — so the bridge calls it through
  // a closure that adds them.
  private readonly suiteWithContext = (model: PersonFormModel) =>
    personValidations(model, this.tenantId(), this.tags());
  protected readonly privacyForm = form(this.personFormData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));
  // Only the usage* preferences are edited here; the rest of the person suite (tags, index,
  // notes, …) is data this accordion never shows and must not gate its save — the
  // isValidForFields rule, read off the signal form (error kind = `vest.<field>`).
  private readonly editedFieldsValid = computed(() =>
    !this.privacyForm().errorSummary().some((e) => EDITED_FIELDS.includes(e.kind.replace(/^vest\./, ''))));

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.privacyForm);
  protected readonly usageImagesErrors = computed(() => this.validationResult().getErrors('usageImages'));
  protected readonly usageDateOfBirthErrors = computed(() => this.validationResult().getErrors('usageDateOfBirth'));
  protected readonly usagePostalAddressErrors = computed(() => this.validationResult().getErrors('usagePostalAddress'));
  protected readonly usageEmailErrors = computed(() => this.validationResult().getErrors('usageEmail'));
  protected readonly usagePhoneErrors = computed(() => this.validationResult().getErrors('usagePhone'));
  protected readonly usageNameErrors = computed(() => this.validationResult().getErrors('usageName'));

  // fields
  protected readonly usageImages = computed(() => this.personFormData().usageImages ?? PrivacyUsage.Public);
  protected readonly usageDateOfBirth = computed(() => this.personFormData().usageDateOfBirth ?? PrivacyUsage.Restricted);
  protected readonly usagePostalAddress = computed(() => this.personFormData().usagePostalAddress ?? PrivacyUsage.Restricted);
  protected readonly usageEmail = computed(() => this.personFormData().usageEmail ?? PrivacyUsage.Restricted);
  protected readonly usagePhone = computed(() => this.personFormData().usagePhone ?? PrivacyUsage.Restricted);
  protected readonly usageName = computed(() => this.personFormData().usageName ?? PrivacyUsage.Restricted);
  protected isScs = computed(() => this.currentUser()?.tenants.includes('scs') || this.currentUser()?.tenants.includes('test'));
  protected readonly srvEmail = computed(() => this.formData().srvEmail ?? true);
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // passing constants to template
  protected privacyUsages = PrivacyUsages;
  protected photoUsages = PhotoUsages;

  constructor() {
    effect(() => this.valid.emit(this.editedFieldsValid()));
  }

  /******************************* actions *************************************** */
  /** usage* privacy preferences are written directly onto the person. */
  protected onUsageChange(fieldName: string, fieldValue: number): void {
    this.dirty.emit(true);
    this.personFormData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** srvEmail is a legacy user-only flag. */
  protected onSrvEmailChange(checked: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, srvEmail: checked }));
  }
}
