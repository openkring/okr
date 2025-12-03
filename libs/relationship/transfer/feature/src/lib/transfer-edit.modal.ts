import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, TransferModel, TransferModelName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { convertFormToTransfer, convertTransferToForm, TransferFormModel } from '@bk2/relationship-transfer-util';

import { TransferFormComponent } from './transfer.form';
import { getTitleLabel } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-transfer-edit-modal',
  standalone: true,
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, TransferFormComponent, CommentsAccordionComponent, 
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-transfer-form
        [formData]="formData()"
        [readOnly]="readOnly()"
        (formDataChange)="onFormDataChange($event)"
      />

      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-comments-accordion [parentKey]="parentKey()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class TransferEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  // inputs
  public transfer = input.required<TransferModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertTransferToForm(this.transfer()));

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('transfer', this.transfer()?.bkey, this.readOnly()));
  protected readonly parentKey = computed(() => `${TransferModelName}.${this.transferKey()}`);
  protected readonly transferKey = computed(() => this.transfer().bkey ?? '');
  protected currentUser = computed(() => this.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToTransfer(this.formData(), this.transfer()), 'confirm')
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertTransferToForm(this.transfer()));  // reset the form
  }

  protected onFormDataChange(formData: TransferFormModel): void {
    this.formData.set(formData);
  }
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
