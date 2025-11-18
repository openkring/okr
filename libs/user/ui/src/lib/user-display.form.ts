import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { AvatarUsages, DeliveryTypes, Languages, NameDisplays, PersonSortCriterias } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { DeliveryType, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent } from "@bk2/shared-ui";

import { debugFormErrors } from "@bk2/shared-util-core";
import { UserDisplayFormModel, userDisplayFormModelShape, userDisplayFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-display-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CategoryComponent, CheckboxComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonCardSubtitle, IonGrid, IonRow, IonCol
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="vm()"
      [suite]="suite" 
      (dirtyChange)="dirtyChange.set($event)"
      (formValueChange)="onValueChange($event)">
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@user.display.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.display.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="avatarUsage" [value]="avatarUsage()" [categories]="avatarUsages" (changed)="onChange('avatarUsage', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="personSortCriteria" [value]="personSortCriteria()" [categories]="personSortCriterias"  [readOnly]="readOnly()" (changed)="onChange('personSortCriteria', $event)" [readOnly]="false" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="userLanguage" [value]="userLanguage()" [categories]="languages" (changed)="onChange('userLanguage', $event)"  [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">                                                             
                <bk-cat name="nameDisplay" [value]="nameDisplay()" [categories]="nameDisplays" (changed)="onChange('nameDisplay', $event)"  [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useDisplayName" [isChecked]="useDisplayName()" [showHelper]="showHelpers()"  [readOnly]="readOnly()" (changed)="onChange('useDisplayName', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showArchivedData" [isChecked]="showArchivedData()" [showHelper]="showHelpers()"  [readOnly]="readOnly()" (changed)="onChange('showArchivedData', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showDebugInfo" [isChecked]="showDebugInfo()" [showHelper]="showHelpers()"  [readOnly]="readOnly()" (changed)="onChange('showDebugInfo', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showHelpers" [isChecked]="showHelpers()" [showHelper]="showHelpers()"  [readOnly]="readOnly()" (changed)="onChange('showHelpers', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserDisplayFormComponent {
  public vm = model.required<UserDisplayFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input.required<boolean>();

  protected avatarUsage = computed(() => this.vm().avatarUsage);
  protected personSortCriteria = computed(() => this.vm().personSortCriteria);
  protected userLanguage = computed(() => this.vm().userLanguage);
  protected nameDisplay = computed(() => this.vm().nameDisplay);
  protected useDisplayName = computed(() => this.vm().useDisplayName);
  protected showArchivedData = computed(() => this.vm().showArchivedData);
  protected showDebugInfo = computed(() => this.vm().showDebugInfo);
  protected showHelpers = computed(() => this.vm().showHelpers);

  protected readonly deliveryTypes = DeliveryTypes;
  protected readonly DT = DeliveryType;
  protected readonly avatarUsages = AvatarUsages;
  protected readonly personSortCriterias = PersonSortCriterias;
  protected readonly languages = Languages;
  protected readonly nameDisplays = NameDisplays;

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => userDisplayFormValidations(this.vm()));

  protected readonly suite = userDisplayFormValidations;
  protected readonly shape = userDisplayFormModelShape;

  protected onValueChange(value: UserDisplayFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('UserDisplayForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }}
