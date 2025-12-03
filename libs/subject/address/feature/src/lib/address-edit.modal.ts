import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { ENV } from "@bk2/shared-config";
import { TranslatePipe } from "@bk2/shared-i18n";
import { AddressModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmationComponent, HeaderComponent } from "@bk2/shared-ui";

import { AddressFormModel, convertAddressToForm, convertFormToAddress } from "@bk2/subject-address-util";

import { AddressFormComponent } from "./address.form";
import { coerceBoolean } from "@bk2/shared-util-core";
import { getTitleLabel } from "@bk2/shared-util-angular";

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
    @if(showConfirmation()) {
        <bk-change-confirmation [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
      } 
    <ion-content>
      @if(formData(); as formData) {
        <bk-address-form
          [formData]="formData" 
          [currentUser]="currentUser()" 
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
          (valid)="formValid.set($event)" 
          (dirty)="formDirty.set($event)"
        />
      }
    </ion-content>
  `
})
export class AddressEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly env = inject(ENV);

  // inputs
  public address = input.required<AddressModel>();
  public currentUser = input.required<UserModel | undefined>();
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertAddressToForm(this.address())); 
  protected title = computed(() => getTitleLabel('subject.address', this.address().bkey, this.isReadOnly()));
  
  public save(): Promise<boolean> {
    this.formDirty.set(false);
    return this.modalController.dismiss(convertFormToAddress(this.formData(), this.address()), 'confirm');
  }

  public cancel(): void {
    this.formData.set(convertAddressToForm(this.address()));
    this.formDirty.set(false);
  }

  protected onFormDataChange(formData: AddressFormModel): void {
    this.formData.set(formData);
    console.log('AddressEditModalComponent.onFormDataChange → formData:', this.formData());
    console.log(`AddressEditModalComponent.onFormDataChange → valid=${this.formValid()}, dirty=${this.formDirty()}`);
  }
}
