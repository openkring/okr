import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, input, model, output, signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PERSONAL_DATA_SHAPE, PersonalDataFormModel, personalDataFormValidations } from "@bk2/profile-util";
import { ChSsnMask } from "@bk2/shared-config";
import { TranslatePipe } from "@bk2/shared-i18n";
import { CategoryListModel, UserModel } from "@bk2/shared-models";
import { CategorySelectComponent, DateInputComponent, ErrorNoteComponent, TextInputComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";
import { DEFAULT_GENDER } from "@bk2/shared-constants";

@Component({
  selector: 'bk-profile-data-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe, 
    vestForms,
    DateInputComponent, TextInputComponent, CategorySelectComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonItem, IonAccordion, IonLabel
  ],
  styles: [`ion-icon { padding-right: 5px;} `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-data">
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
                <ion-label>{{ '@profile.data.description' | translate | async }}</ion-label>
              </ion-item>   
            </ion-col>
          </ion-row>
          <ion-row> 
            <ion-col size="12" size-md="6">                                                              
              <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" autocomplete="bday" [showHelper]="showHelper()" [readOnly]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="genders()!" selectedItemName="gender()" [readOnly]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input name="ssnId" [value]="ssnId()" [maxLength]=16 [mask]="ssnMask" [showHelper]="showHelper()" [copyable]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('ssnId', $event)" />
              <bk-error-note [errors]="ssnIdErrors()" />                                                  
            </ion-col>
          </ion-row>
        </ion-grid>
      </form>
    </div>
  </ion-accordion>
  `,
})
export class ProfileDataAccordionComponent {
  // inputs
  public formData = model.required<PersonalDataFormModel>();
  public color = input('light'); // color of the accordion
  public readonly title = input('@profile.data.title'); // title of the accordion
  public readonly currentUser = input<UserModel | undefined>();
  public readonly genders = input.required<CategoryListModel>();
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = personalDataFormValidations;
  protected readonly shape = PERSONAL_DATA_SHAPE;
  private readonly validationResult = computed(() => personalDataFormValidations(this.formData()));
  protected ssnIdErrors = computed(() => this.validationResult().getErrors('ssnId'));

  // fields
  protected dateOfBirth = computed(() => this.formData().dateOfBirth ?? '');
  protected gender = computed(() => this.formData().gender ?? DEFAULT_GENDER);
  protected ssnId = computed(() => this.formData().ssnId ?? '');
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // passing constants to template
  protected ssnMask = ChSsnMask;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: PersonalDataFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('ProfileData.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('ProfileData.onFieldChange', this.validationResult().errors, this.currentUser());
  }
}
