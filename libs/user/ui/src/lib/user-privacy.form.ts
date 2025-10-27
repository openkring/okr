import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { PrivacyUsages } from "@bk2/shared-categories";
import { TranslatePipe } from "@bk2/shared-i18n";
import { FieldDescription, PrivacyUsage, UserModel } from "@bk2/shared-models";
import { CategoryComponent, CheckboxComponent } from "@bk2/shared-ui";
import { debugFormErrors } from "@bk2/shared-util-core";

import { UserPrivacyFormModel, userPrivacyFormModelShape, userPrivacyFormValidations } from "@bk2/user-util";

@Component({
  selector: 'bk-user-privacy-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CategoryComponent, CheckboxComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle,
    IonGrid, IonRow, IonCol, IonItem, IonLabel
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
          <ion-card-title>{{ '@user.privacy.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
        {{ '@user.privacy.description' | translate | async }}
          <ion-grid>
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
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserPrivacyFormComponent {
  public vm = model.required<UserPrivacyFormModel>();
  public currentUser = input<UserModel | undefined>();

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => userPrivacyFormValidations(this.vm()));

  protected usageImages = computed(() => this.vm().usageImages ?? PrivacyUsage.Restricted);
  protected usageDateOfBirth = computed(() => this.vm().usageDateOfBirth ?? PrivacyUsage.Restricted);
  protected usagePostalAddress = computed(() => this.vm().usagePostalAddress ?? PrivacyUsage.Restricted);
  protected usageEmail = computed(() => this.vm().usageEmail ?? PrivacyUsage.Restricted);
  protected usagePhone = computed(() => this.vm().usagePhone ?? PrivacyUsage.Restricted);
  protected usageName = computed(() => this.vm().usageName ?? PrivacyUsage.Restricted);
  protected isScs = computed(() => this.currentUser()?.tenants.includes('scs') || this.currentUser()?.tenants.includes('test'));
  protected srvEmail = computed(() => this.vm().srvEmail ?? true);

  protected readonly suite = userPrivacyFormValidations;
  protected readonly shape = userPrivacyFormModelShape;

  protected privacyUsages = PrivacyUsages;

  protected onValueChange(value: UserPrivacyFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('UserPrivacyForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
