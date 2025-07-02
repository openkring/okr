import { AsyncPipe } from "@angular/common";
import { Component, computed, input, model, output, signal } from "@angular/core";
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from "@ionic/angular/standalone";
import { vestForms, vestFormsViewProviders } from "ngx-vest-forms";

import { TranslatePipe } from "@bk2/shared/i18n";
import { AllRoles, UserModel } from "@bk2/shared/models";
import { CheckboxComponent, ChipsComponent } from "@bk2/shared/ui";

import { flattenRoles, UserAuthFormModel, userAuthFormModelShape, userAuthFormValidations } from "@bk2/user/util";
import { debugFormErrors } from "@bk2/shared/util-core";

@Component({
  selector: 'bk-user-auth-form',
  imports: [
    TranslatePipe, AsyncPipe,
    vestForms,
    CheckboxComponent, ChipsComponent,
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
          <ion-card-title>{{ '@user.auth.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@user.auth.description' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useTouchId" [isChecked]="useTouchId()" [showHelper]="true" (changed)="onChange('useTouchId', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="useFaceId" [isChecked]="useFaceId()" [showHelper]="true" (changed)="onChange('useFaceId', $event)" />
              </ion-col>
            </ion-row>
            <ion-row>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-chips chipName="role" [storedChips]="roles()" [allChips]="allRoles" (changed)="onChange('roles', $event)" />
    </form>
  `
})
export class UserAuthFormComponent {
  public vm = model.required<UserAuthFormModel>();
  public currentUser = input<UserModel | undefined>();

  protected useTouchId = computed(() => this.vm().useTouchId ?? false);
  protected useFaceId = computed(() => this.vm().useFaceId ?? false);
  protected roles = computed(() => flattenRoles(this.vm().roles ?? { 'registered': true }));

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  private readonly validationResult = computed(() => userAuthFormValidations(this.vm()));

  protected readonly suite = userAuthFormValidations;
  protected readonly shape = userAuthFormModelShape;

  protected allRoles = AllRoles;

  protected onValueChange(value: UserAuthFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | number | boolean): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('UserAuthForm', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }
}
