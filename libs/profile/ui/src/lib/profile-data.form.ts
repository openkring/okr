import { AsyncPipe } from "@angular/common";
import { Component, computed, input, linkedSignal, model, output } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { ChSsnMask } from "@bk2/shared-config";
import { TranslatePipe } from "@bk2/shared-i18n";
import { CategoryListModel, PersonModel, UserModel } from "@bk2/shared-models";
import { CategorySelectComponent, DateInputComponent, ErrorNoteComponent, TextInputComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors, debugFormModel } from "@bk2/shared-util-core";
import { DEFAULT_GENDER } from "@bk2/shared-constants";
import { AhvFormat, formatAhv } from "@bk2/shared-util-angular";

import { personValidations } from "@bk2/subject-person-util";

@Component({
  selector: 'bk-profile-data-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe, 
    vestForms,
    DateInputComponent, TextInputComponent, CategorySelectComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonItem, IonAccordion, IonLabel
  ],
  styles: [`
    ion-icon { padding-right: 5px;}
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-data">
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
                  <ion-label>{{ '@profile.data.description' | translate | async }}</ion-label>
                </ion-item>   
              </ion-col>
            </ion-row>
            <ion-row> 
              <ion-col size="12" size-md="6">                                                              
                <bk-date-input
                  name="dateOfBirth"
                  [storeDate]="dateOfBirth()"
                  (storeDateChange)="onFieldChange('dateOfBirth', $event)"
                  autocomplete="bday"
                  [showHelper]="showHelper()"
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
                  name="ssnId"
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
export class ProfileDataAccordionComponent {
  // inputs
  public formData = model.required<PersonModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input<boolean>(true);   // used for initializing the form and resetting vest validations
  public color = input('light'); // color of the accordion
  public readonly title = input('@profile.data.title'); // title of the accordion
  public readonly tenantId = input.required<string>();
  public readonly tags = input.required<string>();
  public readonly genders = input.required<CategoryListModel>();
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = personValidations;
  private readonly validationResult = computed(() => personValidations(this.formData(), this.tenantId(), this.tags()));
  protected ssnIdErrors = computed(() => this.validationResult().getErrors('ssnId'));

  // fields
  protected dateOfBirth = linkedSignal(() => this.formData().dateOfBirth ?? '');
  protected gender = linkedSignal(() => this.formData().gender ?? DEFAULT_GENDER);
  protected ssnId = linkedSignal(() => formatAhv(this.formData().ssnId ?? '', AhvFormat.Friendly));
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // passing constants to template
  protected ssnMask = ChSsnMask;

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: PersonModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('ProfilePrivacy.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('ProfileData.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }
}
