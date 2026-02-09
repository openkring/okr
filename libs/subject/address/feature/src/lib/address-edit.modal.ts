import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular/standalone";

import { AddressModel, UserModel } from "@bk2/shared-models";
import { ChangeConfirmationComponent, HeaderComponent } from "@bk2/shared-ui";
import { coerceBoolean, safeStructuredClone } from "@bk2/shared-util-core";
import { getTitleLabel } from "@bk2/shared-util-angular";

import { AddressFormComponent } from "@bk2/subject-address-ui";

@Component({
  selector: 'bk-address-edit-modal',
  standalone: true,
  imports: [
    AddressFormComponent, HeaderComponent, ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-address-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser" 
            [readOnly]="isReadOnly()"
            [showForm]="showForm()"
            [allTags]="tags()"
            [tenantId]="tenantId()" 
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class AddressEditModalComponent {
  private readonly modalController = inject(ModalController);

  // inputs
  public address = input.required<AddressModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public readOnly = input.required<boolean>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.address()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('subject.address', this.address().bkey, this.isReadOnly()));

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
}
