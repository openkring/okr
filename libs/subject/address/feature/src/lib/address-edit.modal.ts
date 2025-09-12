import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { ENV } from "@bk2/shared-config";
import { TranslatePipe } from "@bk2/shared-i18n";
import { AddressModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmationComponent, HeaderComponent } from "@bk2/shared-ui";

import { convertAddressToForm, convertFormToAddress, getAddressModalTitle } from "@bk2/subject-address-util";

import { AddressFormComponent } from "./address.form";

@Component({
  selector: 'bk-address-edit-modal',
  standalone: true,
  imports: [
    AddressFormComponent, HeaderComponent, ChangeConfirmationComponent,
    IonContent,
    TranslatePipe, AsyncPipe
  ],
  template: `
    <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
    <ion-content>
      <bk-address-form [(vm)]="vm" [currentUser]="currentUser()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class AddressEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);

  public address = input.required<AddressModel>();
  public currentUser = input.required<UserModel | undefined>();
  
  public title = computed(() => getAddressModalTitle(this.address().bkey));
  public vm = linkedSignal(() => convertAddressToForm(this.address())); 

  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToAddress(this.address(), this.vm(), this.env.tenantId), 'confirm');
  }
}
