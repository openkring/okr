import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { AddressModel, CategoryListModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from "@bk2/shared-ui";
import { coerceBoolean, safeStructuredClone } from "@bk2/shared-util-core";

import { AddressForm } from "@bk2/subject-address-ui";
import { AddressStore } from "./addresses.store";

@Component({
  selector: 'bk-address-edit-modal',
  standalone: true,
  imports: [
    AddressForm, Header, ChangeConfirmation,
    IonContent
  ],  
  providers: [AddressStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-address-form
            [i18n]="store.i18n"
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [readOnly]="isReadOnly()"
            [showForm]="showForm()"
            [allTags]="tags()"
            [addressChannels]="addressChannels()"
            [addressUsages]="addressUsages()"
            [tenantId]="tenantId()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class AddressEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(AddressStore);

  // inputs
  public address = input.required<AddressModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input.required<string>();
  public readonly addressChannels = input.required<CategoryListModel>();
  public readonly addressUsages = input.required<CategoryListModel>();
  public tenantId = input.required<string>();
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.address()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.address().bkey));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.address()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: AddressModel): void {
    this.formData.set(formData);
  }

  protected getTitleLabel(readOnly: boolean, key: string): string {
    if (this.readOnly()) {
      return this.store.i18n.view_label();
    }
    if (key.length > 0) {
      return this.store.i18n.update_label();
    } else {
      return this.store.i18n.create_label();
    }
  }
}
