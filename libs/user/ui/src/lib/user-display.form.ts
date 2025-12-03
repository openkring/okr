import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, input, model, output, signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { AvatarUsages, DeliveryTypes, Languages, NameDisplays, PersonSortCriterias } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { DeliveryType, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent } from "@bk2/shared-ui";

import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";
import { USER_DISPLAY_FORM_SHAPE, UserDisplayFormModel, userDisplayFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-display-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CategoryComponent, CheckboxComponent,
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
          <ion-card-title>{{ '@user.display.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.display.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="avatarUsage" [value]="avatarUsage()" [categories]="avatarUsages" (changed)="onFieldChange('avatarUsage', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="personSortCriteria" [value]="personSortCriteria()" [categories]="personSortCriterias"  [readOnly]="isReadOnly()" (changed)="onFieldChange('personSortCriteria', $event)" [readOnly]="false" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="userLanguage" [value]="userLanguage()" [categories]="languages" (changed)="onFieldChange('userLanguage', $event)"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="nameDisplay" [value]="nameDisplay()" [categories]="nameDisplays" (changed)="onFieldChange('nameDisplay', $event)"  [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useDisplayName" [isChecked]="useDisplayName()" [showHelper]="showHelpers()"  [readOnly]="isReadOnly()" (changed)="onFieldChange('useDisplayName', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showArchivedData" [isChecked]="showArchivedData()" [showHelper]="showHelpers()"  [readOnly]="isReadOnly()" (changed)="onFieldChange('showArchivedData', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showDebugInfo" [isChecked]="showDebugInfo()" [showHelper]="showHelpers()"  [readOnly]="isReadOnly()" (changed)="onFieldChange('showDebugInfo', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showHelpers" [isChecked]="showHelpers()" [showHelper]="showHelpers()"  [readOnly]="isReadOnly()" (changed)="onFieldChange('showHelpers', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserDisplayFormComponent {
  // inputs
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
  protected avatarUsage = computed(() => this.formData().avatarUsage);
  protected personSortCriteria = computed(() => this.formData().personSortCriteria);
  protected userLanguage = computed(() => this.formData().userLanguage);
  protected nameDisplay = computed(() => this.formData().nameDisplay);
  protected useDisplayName = computed(() => this.formData().useDisplayName);
  protected showArchivedData = computed(() => this.formData().showArchivedData);
  protected showDebugInfo = computed(() => this.formData().showDebugInfo);
  protected showHelpers = computed(() => this.formData().showHelpers);

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

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('UserDisplayForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }}
