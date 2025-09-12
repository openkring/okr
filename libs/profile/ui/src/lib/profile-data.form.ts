import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PersonalDataFormModel, personalDataFormModelShape, personalDataFormValidations } from "@bk2/profile-util";
import { GenderTypes } from "@bk2/shared-categories";
import { ChSsnMask } from "@bk2/shared-config";
import { TranslatePipe } from "@bk2/shared-i18n";
import { GenderType, UserModel } from "@bk2/shared-models";
import { CategoryComponent, DateInputComponent, ErrorNoteComponent, TextInputComponent } from "@bk2/shared-ui";
import { debugFormErrors } from "@bk2/shared-util-core";

@Component({
  selector: 'bk-profile-data-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe, 
    vestForms,
    DateInputComponent, TextInputComponent, CategoryComponent, ErrorNoteComponent,
    IonGrid, IonRow, IonCol, IonItem, IonAccordion, IonLabel
  ],
  styles: [`
    ion-icon {
      padding-right: 5px;
    }
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-data">
    <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() | translate | async }}</ion-label>
    </ion-item>
    <div slot="content">
      <form scVestForm
        [formShape]="shape"
        [formValue]="vm()"
        [suite]="suite" 
        (dirtyChange)="dirtyChange.set($event)"
        (formValueChange)="onValueChange($event)">

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
              <bk-date-input name="dateOfBirth" [storeDate]="dateOfBirth()" autocomplete="bday" [showHelper]=true [readOnly]=true />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="gender" [value]="gender()" [categories]="genderTypes" [readOnly]=true />                                                  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input name="ssnId" [value]="ssnId()" [maxLength]=16 [mask]="ssnMask" [showHelper]=true [copyable]=true (changed)="onChange('ssnId', $event)" />
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
  public vm = model.required<PersonalDataFormModel>();
  public color = input('light'); // color of the accordion
  public title = input('@profile.data.title'); // title of the accordion
  public currentUser = input<UserModel | undefined>();

  protected dateOfBirth = computed(() => this.vm().dateOfBirth ?? '');
  protected gender = computed(() => this.vm().gender ?? GenderType.Male);
  protected ssnId = computed(() => this.vm().ssnId ?? '');

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => personalDataFormValidations(this.vm()));
  protected ssnIdErrors = computed(() => this.validationResult().getErrors('ssnId'));

  protected readonly suite = personalDataFormValidations;
  protected readonly shape = personalDataFormModelShape;

  protected genderType = GenderType;
  protected genderTypes = GenderTypes;
  protected ssnMask = ChSsnMask;

  protected onValueChange(value: PersonalDataFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ProfileData', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
