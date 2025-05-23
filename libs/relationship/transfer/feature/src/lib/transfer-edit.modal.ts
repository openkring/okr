import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ENV, RoleName } from '@bk2/shared/config';
import { ModelType, TransferCollection, TransferModel } from '@bk2/shared/models';
import { hasRole } from '@bk2/shared/util';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { AppStore } from '@bk2/auth/feature';

import { convertFormToTransfer, convertTransferToForm } from '@bk2/transfer/util';
import { TransferFormComponent } from './transfer.form';

@Component({
  selector: 'bk-transfer-edit-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    TransferFormComponent, CommentsAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ '@transfer.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-transfer-form [(vm)]="vm" [currentUser]="appStore.currentUser()" transferTags="test" (validChange)="formIsValid.set($event)" />

      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="transferCollection" [parentKey]="transferKey()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class TransferEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);
  private readonly env = inject(ENV);

  public transfer = input.required<TransferModel>();

  public vm = linkedSignal(() => convertTransferToForm(this.transfer()));
  protected readonly transferKey = computed(() => this.transfer().bkey ?? '');
  protected transferTags = computed(() => this.appStore.getTags(ModelType.Transfer));

  protected formIsValid = signal(false);

  protected modelType = ModelType;
  protected transferCollection = TransferCollection;

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToTransfer(this.transfer(), this.vm(), this.env.owner.tenantId), 'confirm');
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
