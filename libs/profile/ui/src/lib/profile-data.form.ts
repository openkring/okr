import { Component, computed, effect, input, linkedSignal, model, output, Signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";

import { ChSsnMask } from "@bk2/shared-config";
import { CategoryListModel, PersonModel, UserModel } from "@bk2/shared-models";
import { CategorySelect, DateInput, DateInputI18n, ErrorNote, TextInput, TextInputI18n } from "@bk2/shared-ui";
import { coerceBoolean } from "@bk2/shared-util-core";
import { DEFAULT_GENDER } from "@bk2/shared-constants";
import { AhvFormat, formatAhv } from "@bk2/shared-util-angular";

import { personValidations } from "@bk2/subject-person-util";
import { ProfileI18n } from '@bk2/profile-util';

@Component({
  selector: 'bk-profile-data-accordion',
  standalone: true,
  imports: [
    DateInput, TextInput, CategorySelect, ErrorNote,
    IonGrid, IonRow, IonCol, IonItem, IonAccordion, IonLabel
  ],
  styles: [`
    ion-icon { padding-right: 5px;}
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-data">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n().personal_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      @if (showForm()) {
        <form novalidate>

          <ion-grid>
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label>{{ i18n().personal_description() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row> 
              <ion-col size="12" size-md="6">                                                              
                <bk-date-input
                  [i18n]="dobI18n()"
                  [storeDate]="dateOfBirth()"
                  (storeDateChange)="onFieldChange('dateOfBirth', $event)"
                  autocomplete="bday"
                  [readOnly]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select
                  [category]="genders()!"
                  [selectedItemName]="gender()"
                  (selectedItemNameChange)="onFieldChange('gender', $event)"
                  [readOnly]="true"
                />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input
                  [i18n]="ssnI18n()"
                  [value]="ssnId()" 
                  (valueChange)="onFieldChange('ssnId', $event)"
                  [maxLength]=16
                  [mask]="ssnMask"
                  [showHelper]="showHelper()"
                  [copyable]=true
                  [readOnly]="isReadOnly()"
                />
                <bk-error-note [errors]="ssnIdErrors()" />                                                  
              </ion-col>
            </ion-row>
          </ion-grid>
        </form>
      }
    </div>
  </ion-accordion>
  `,
})
export class ProfileDataAccordion {
  // inputs
  public readonly i18n = input.required<ProfileI18n>();
  public formData = model.required<PersonModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('light'); // color of the accordion
  public readonly tenantId = input.required<string>();
  public readonly tags = input.required<string>();
  public readonly genders = input.required<CategoryListModel>();
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  private readonly validationResult = computed(() => personValidations(this.formData(), this.tenantId(), this.tags()));
  protected ssnIdErrors = computed(() => this.validationResult().getErrors('ssnId'));
  protected dobI18n = computed(() => ({
    name: 'dateOfBirth',
    label: this.i18n().personal_dob_label(),
    placeholder: this.i18n().personal_dob_placeholder(),
    helper: this.i18n().personal_dob_helper()
  } as DateInputI18n));

  protected ssnI18n = computed(() => ({
    name: 'ssn',
    label: this.i18n().personal_ssn_label(),
    placeholder: this.i18n().personal_ssn_placeholder(),
    helper: this.i18n().personal_ssn_helper()
  } as TextInputI18n));

  // fields
  protected dateOfBirth = linkedSignal(() => this.formData().dateOfBirth ?? '');
  protected gender = linkedSignal(() => this.formData().gender ?? DEFAULT_GENDER);
  protected ssnId = linkedSignal(() => formatAhv(this.formData().ssnId ?? '', AhvFormat.Friendly));
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // passing constants to template
  protected ssnMask = ChSsnMask;

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
