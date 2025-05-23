import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { UserModel } from "@bk2/shared/models";
import { EmailInputComponent, TextInputComponent } from "@bk2/shared/ui";
import { TranslatePipe } from "@bk2/shared/i18n";
import { debugFormErrors } from "@bk2/shared/util";

import { UserModelFormModel, userModelFormModelShape, userModelFormValidations } from "@bk2/user/util";

@Component({
  selector: 'bk-user-model',
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    TextInputComponent, EmailInputComponent,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonCardSubtitle
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
          <ion-card-title>{{ '@user.model.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.model.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="bkey" label="@input.userKey.label" placeholder="@input.userKey.placeholder" [value]="bkey()" [readOnly]=true [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="personKey" [value]="personKey()" [readOnly]=true [copyable]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="firstName" [value]="firstName()" [copyable]=true (changed)="onChange('firstName', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="lastName" [value]="lastName()" [copyable]=true (changed)="onChange('lastName', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email name="loginEmail" [value]="loginEmail()" [readOnly]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-email name="gravatarEmail" [value]="gravatarEmail()" (changed)="onChange('gravatarEmail', $event)"  />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="tenants" [value]="tenants()" [readOnly]=true [copyable]=true />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    </form>
  `
})
export class UserModelFormComponent {
  public vm = model.required<UserModelFormModel>();
  public currentUser = input<UserModel | undefined>();

  protected bkey = computed(() => this.vm().bkey);
  protected tenants = computed(() => {
    const _tenants = this.vm().tenants;
    return Array.isArray(_tenants) ? _tenants.join(',') : _tenants;
  });
  protected personKey = computed(() => this.vm().personKey);
  protected firstName = computed(() => this.vm().firstName);
  protected lastName = computed(() => this.vm().lastName);
  protected loginEmail = computed(() => this.vm().loginEmail);
  protected gravatarEmail = computed(() => this.vm().gravatarEmail);
  // tbd: notes

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => userModelFormValidations(this.vm()));

  protected readonly suite = userModelFormValidations;
  protected readonly shape = userModelFormModelShape;

  protected onValueChange(value: UserModelFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('UserModel', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
