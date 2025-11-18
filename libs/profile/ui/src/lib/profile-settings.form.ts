import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, input, model, output, signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { AvatarUsages, DeliveryTypes, Languages, NameDisplays, PersonSortCriterias } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { AvatarUsage, DefaultLanguage, DeliveryType, NameDisplay, PersonSortCriteria, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent, ErrorNoteComponent, TextInputComponent } from "@bk2/shared-ui";
import { debugFormErrors } from "@bk2/shared-util-core";

import { SettingsFormModel, settingsFormModelShape, settingsFormValidations } from "@bk2/profile-util";

@Component({
  selector: 'bk-profile-settings-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    vestForms,
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryComponent, CheckboxComponent, TextInputComponent, ErrorNoteComponent,
  ],
  styles: [`
    ion-icon {
      padding-right: 5px;
    }
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-settings">
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
                <ion-label>{{ '@profile.settings.description' | translate | async }}</ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row> 
            <ion-col size="12">
              <bk-cat name="language" [value]="language()" [categories]="languages" [readOnly]="readOnly()" (changed)="onChange('language', $event)" />                                                             
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showDebugInfo" [isChecked]="showDebugInfo()" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('showDebugInfo', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showArchivedData" [isChecked]="showArchivedData()" [readOnly]="readOnly()" [showHelper]="true" (changed)="onChange('showArchivedData', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showHelpers" [isChecked]="showHelpers()" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('showHelpers', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="useTouchId" [isChecked]="useTouchId()" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('useTouchId', $event)" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="useFaceId" [isChecked]="useFaceId()" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('useFaceId', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="avatarUsage" [value]="avatarUsage()" [categories]="avatarUsages" [readOnly]="readOnly()" [showHelper]="true" (changed)="onChange('avatarUsage', $event)" />  
            </ion-col>
            @if(avatarUsage() === avatarUsageEnum.GravatarFirst || avatarUsage() === avatarUsageEnum.PhotoFirst) {
              <ion-col size="12" size-md="6">
                <bk-text-input name="gravatarEmail" [value]="gravatarEmail()" [showHelper]=true [copyable]=true [readOnly]="readOnly()" (changed)="onChange('gravatarEmail', $event)" /> 
                <bk-error-note [errors]="gravatarEmailErrors()" />                                                 
              </ion-col>
            }
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="nameDisplay" [value]="nameDisplay()" [categories]="nameDisplays" [readOnly]="readOnly()"  [showHelper]="true" (changed)="onChange('nameDisplay', $event)"/>  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="personSortCriteria" [value]="personSortCriteria()" [categories]="personSortCriterias" [readOnly]="readOnly()" [showHelper]="true" (changed)="onChange('personSortCriteria', $event)"/>  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="useDisplayName" [isChecked]="useDisplayName()" [showHelper]="true" [readOnly]="readOnly()" (changed)="onChange('useDisplayName', $event)" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat name="newsDelivery" [value]="newsDelivery()" [categories]="deliveryTypes" [readOnly]="readOnly()" [showHelper]="true" (changed)="onChange('newsDelivery', $event)"/>  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="invoiceDelivery" [value]="invoiceDelivery()" [categories]="deliveryTypes" [readOnly]="readOnly()" [showHelper]="true" (changed)="onChange('invoiceDelivery', $event)"/>  
            </ion-col>
          </ion-row>
        </ion-grid>
      </form>
    </div>
  </ion-accordion>
  `,
})
export class ProfileSettingsAccordionComponent {
  protected readonly modalController = inject(ModalController);

  public vm = model.required<SettingsFormModel>();
  public color = input('light'); // color of the accordion
  public title = input('@profile.settings.title'); // title of the accordion
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => settingsFormValidations(this.vm()));
  protected gravatarEmailErrors = computed(() => this.validationResult().getErrors('gravatarEmail'));

  protected language = computed(() => this.vm().language ?? DefaultLanguage);
  protected showDebugInfo = computed(() => this.vm().showDebugInfo ?? false);
  protected showArchivedData = computed(() => this.vm().showArchivedData ?? false);
  protected showHelpers = computed(() => this.vm().showHelpers ?? true);
  protected useTouchId = computed(() => this.vm().useTouchId ?? false);
  protected useFaceId = computed(() => this.vm().useFaceId ?? false);
  protected avatarUsage = computed(() => this.vm().avatarUsage ?? AvatarUsage.PhotoFirst);
  protected gravatarEmail = computed(() => this.vm().gravatarEmail ?? '');
  protected nameDisplay = computed(() => this.vm().nameDisplay ?? NameDisplay.FirstLast);
  protected personSortCriteria = computed(() => this.vm().personSortCriteria ?? PersonSortCriteria.Fullname);
  protected useDisplayName = computed(() => this.vm().useDisplayName ?? false);
  protected newsDelivery = computed(() => this.vm().newsDelivery ?? DeliveryType.EmailAttachment);
  protected invoiceDelivery = computed(() => this.vm().invoiceDelivery ?? DeliveryType.EmailAttachment);

  protected readonly suite = settingsFormValidations;
  protected readonly shape = settingsFormModelShape;

  protected avatarUsages = AvatarUsages;
  protected avatarUsageEnum = AvatarUsage;
  protected nameDisplays = NameDisplays;
  protected personSortCriterias = PersonSortCriterias;
  protected deliveryTypes = DeliveryTypes;
  protected languages = Languages;
  
  protected onValueChange(value: SettingsFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ProfileSettings', this.validationResult().errors, this.currentUser());
    // tbd: if language:   this.i18nService.setActiveLang(language);
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
