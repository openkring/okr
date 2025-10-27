import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, input, linkedSignal, model, output, signal } from "@angular/core";
import { IonAccordion, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { PrivacyUsage, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent } from "@bk2/shared-ui";
import { debugFormErrors } from "@bk2/shared-util-core";

import { PrivacyFormModel, privacyFormModelShape, privacyFormValidations } from "@bk2/profile-util";

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
              <bk-cat name="usageImages" [value]="usageImages()" [categories]="privacyUsages" (changed)="onChange('usageImages', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usageDateOfBirth" [value]="usageDateOfBirth()" [categories]="privacyUsages" (changed)="onChange('usageDateOfBirth', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usagePostalAddress" [value]="usagePostalAddress()" [categories]="privacyUsages" (changed)="onChange('usagePostalAddress', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usageEmail" [value]="usageEmail()" [categories]="privacyUsages" (changed)="onChange('usageEmail', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usagePhone" [value]="usagePhone()" [categories]="privacyUsages" (changed)="onChange('usagePhone', $event)" />  
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-cat name="usageName" [value]="usageName()" [categories]="privacyUsages" (changed)="onChange('usageName', $event)" />  
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
                <bk-checkbox name="srvEmail" [isChecked]="srvEmail()" [showHelper]="true" (changed)="onChange('srvEmail', $event)" />
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

  public vm = model.required<PrivacyFormModel>();
  public color = input('light'); // color of the accordion
  public title = input('@profile.privacy.title'); // title of the accordion
  public currentUser = input<UserModel | undefined>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => privacyFormValidations(this.vm()));

  protected usageImages = computed(() => this.vm().usageImages ?? PrivacyUsage.Public);
  protected usageDateOfBirth = computed(() => this.vm().usageDateOfBirth ?? PrivacyUsage.Restricted);
  protected usagePostalAddress = computed(() => this.vm().usagePostalAddress ?? PrivacyUsage.Restricted);
  protected usageEmail = computed(() => this.vm().usageEmail ?? PrivacyUsage.Restricted);
  protected usagePhone = computed(() => this.vm().usagePhone ?? PrivacyUsage.Restricted);
  protected usageName = computed(() => this.vm().usageName ?? PrivacyUsage.Restricted);
  protected isScs = computed(() => this.currentUser()?.tenants.includes('scs') || this.currentUser()?.tenants.includes('test'));
  protected srvEmail = linkedSignal(() => this.vm().srvEmail ?? true);

  protected readonly suite = privacyFormValidations;
  protected readonly shape = privacyFormModelShape;
  
  protected privacyUsages = PrivacyUsages;

  protected onValueChange(value: PrivacyFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('ProfilePrivacy', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
