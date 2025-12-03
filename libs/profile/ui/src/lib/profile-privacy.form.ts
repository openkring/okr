import { AsyncPipe } from "@angular/common";
import { Component, computed, effect, inject, input, linkedSignal, model, output, signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { PrivacyUsage, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent } from "@bk2/shared-ui";
import { coerceBoolean, debugFormErrors } from "@bk2/shared-util-core";

import { PRIVACY_FORM_SHAPE, PrivacyFormModel, privacyFormValidations } from "@bk2/profile-util";

@Component({
  selector: 'bk-profile-privacy-accordion',
  standalone: true,
  imports: [ 
    TranslatePipe, AsyncPipe,
    vestForms,
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol,
    CategoryComponent, CheckboxComponent
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
          [formValue]="formData()"
          [suite]="suite" 
          (dirtyChange)="dirty.emit($event)"
          (formValueChange)="onFormChange($event)">
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
              <bk-cat name="usageImages" [value]="usageImages()" [categories]="privacyUsages" [readOnly]="isReadOnly()" (changed)="onFieldChange('usageImages', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usageDateOfBirth" [value]="usageDateOfBirth()" [categories]="privacyUsages" [readOnly]="isReadOnly()" (changed)="onFieldChange('usageDateOfBirth', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usagePostalAddress" [value]="usagePostalAddress()" [categories]="privacyUsages" [readOnly]="isReadOnly()" (changed)="onFieldChange('usagePostalAddress', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usageEmail" [value]="usageEmail()" [categories]="privacyUsages" [readOnly]="isReadOnly()" (changed)="onFieldChange('usageEmail', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usagePhone" [value]="usagePhone()" [categories]="privacyUsages" [readOnly]="isReadOnly()" (changed)="onFieldChange('usagePhone', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usageName" [value]="usageName()" [categories]="privacyUsages" [readOnly]="isReadOnly()" (changed)="onFieldChange('usageName', $event)" />  
            </ion-col>
          </ion-row>
          @if(isScs()) {
            <ion-row>
              <ion-col>
                <ion-item lines="none">
                  <ion-label>{{ '@auth.privacyUsage.srv.description' | translate | async }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <bk-checkbox name="srvEmail" [isChecked]="srvEmail()" [showHelper]="showHelper()" [readOnly]="isReadOnly()" (changed)="onFieldChange('srvEmail', $event)" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </form>
    </div>
  </ion-accordion>
  `,
})
export class ProfilePrivacyAccordionComponent {
  protected readonly modalController = inject(ModalController);

  // inputs
  public formData = model.required<PrivacyFormModel>();
  public color = input('light'); // color of the accordion
  public title = input('@profile.privacy.title'); // title of the accordion
  public currentUser = input<UserModel | undefined>();
  public readonly readOnly = input<boolean>(true);
  public readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = privacyFormValidations;
  protected readonly shape = PRIVACY_FORM_SHAPE;
  private readonly validationResult = computed(() => privacyFormValidations(this.formData()));
  protected showHelper = computed(() => this.currentUser()?.showHelpers ?? true);

  // fields
  protected usageImages = computed(() => this.formData().usageImages ?? PrivacyUsage.Public);
  protected usageDateOfBirth = computed(() => this.formData().usageDateOfBirth ?? PrivacyUsage.Restricted);
  protected usagePostalAddress = computed(() => this.formData().usagePostalAddress ?? PrivacyUsage.Restricted);
  protected usageEmail = computed(() => this.formData().usageEmail ?? PrivacyUsage.Restricted);
  protected usagePhone = computed(() => this.formData().usagePhone ?? PrivacyUsage.Restricted);
  protected usageName = computed(() => this.formData().usageName ?? PrivacyUsage.Restricted);
  protected isScs = computed(() => this.currentUser()?.tenants.includes('scs') || this.currentUser()?.tenants.includes('test'));
  protected srvEmail = linkedSignal(() => this.formData().srvEmail ?? true);

  // passing constants to template
  protected privacyUsages = PrivacyUsages;

 constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: PrivacyFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('ProfilePrivacy.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }

  protected onFieldChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ProfilePrivacy', this.validationResult().errors, this.currentUser());
  }
}
