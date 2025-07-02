import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, input, model, output, signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";

import { TranslatePipe } from "@bk2/shared/i18n";
import { PrivacyUsage, UserModel } from "@bk2/shared/models";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";
import { CategoryComponent } from "@bk2/shared/ui";
import { PrivacyFormModel, privacyFormModelShape, privacyFormValidations } from "@bk2/profile/util";
import { PrivacyUsages } from "@bk2/shared/categories";
import { debugFormErrors } from "@bk2/shared/util-core";

@Component({
  selector: 'bk-profile-privacy-accordion',
  imports: [ 
    TranslatePipe, AsyncPipe,
    vestForms,
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryComponent
  ],
  styles: [`
    ion-icon {
      padding-right: 5px;
    }
  `],
  viewProviders: [vestFormsViewProviders],
  template: `
  <ion-accordion toggle-icon-slot="start" value="profile-privacy">
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
                <ion-label>{{ '@profile.privacy.description' | translate | async }}</ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-cat name="usage_images" [value]="usage_images()" [categories]="privacyUsages" (changed)="onChange('usage_images', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usage_dateOfBirth" [value]="usage_dateOfBirth()" [categories]="privacyUsages" (changed)="onChange('usage_dateOfBirth', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usage_postalAddress" [value]="usage_postalAddress()" [categories]="privacyUsages" (changed)="onChange('usage_postalAddress', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usage_email" [value]="usage_email()" [categories]="privacyUsages" (changed)="onChange('usage_email', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usage_phone" [value]="usage_phone()" [categories]="privacyUsages" (changed)="onChange('usage_phone', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usage_name" [value]="usage_name()" [categories]="privacyUsages" (changed)="onChange('usage_name', $event)" />  
            </ion-col>
          </ion-row>
        </ion-grid>
      </form>
    </div>
  </ion-accordion>
  `,
})
export class ProfilePrivacyAccordionComponent {
  protected readonly modalController = inject(ModalController);

  public vm = model.required<PrivacyFormModel>();
  public color = input('light'); // color of the accordion
  public title = input('@profile.privacy.title'); // title of the accordion
  public currentUser = input<UserModel | undefined>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => privacyFormValidations(this.vm()));

  protected usage_images = computed(() => this.vm().usage_images ?? PrivacyUsage.Public);
  protected usage_dateOfBirth = computed(() => this.vm().usage_dateOfBirth ?? PrivacyUsage.Restricted);
  protected usage_postalAddress = computed(() => this.vm().usage_postalAddress ?? PrivacyUsage.Restricted);
  protected usage_email = computed(() => this.vm().usage_email ?? PrivacyUsage.Restricted);
  protected usage_phone = computed(() => this.vm().usage_phone ?? PrivacyUsage.Restricted);
  protected usage_name = computed(() => this.vm().usage_name ?? PrivacyUsage.Restricted);

  protected readonly suite = privacyFormValidations;
  protected readonly shape = privacyFormModelShape;
  
  protected privacyUsage = PrivacyUsage;
  protected privacyUsages = PrivacyUsages;

  protected onValueChange(value: PrivacyFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ProfilePrivacy', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
