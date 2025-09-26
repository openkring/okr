import { AsyncPipe } from "@angular/common";
import { Component, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { TranslatePipe } from "@bk2/shared-i18n";
import { FirebaseUserModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmationComponent, HeaderComponent } from "@bk2/shared-ui";

import { FbuserFormComponent } from "@bk2/user-ui";

@Component({
  selector: 'bk-address-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, FbuserFormComponent,
    IonContent,
    TranslatePipe, AsyncPipe
  ],
  template: `
    <bk-header title="{{ '@user.fbuser.edit.title' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
    <ion-content>
      <bk-fbuser-form [(vm)]="vm" [currentUser]="currentUser()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class FbuserEditModalComponent {
  private readonly modalController = inject(ModalController);

  public fbuser = input.required<FirebaseUserModel>();
  public currentUser = input.required<UserModel | undefined>();

  public vm = linkedSignal(() => this.fbuser()); 

  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }
}
