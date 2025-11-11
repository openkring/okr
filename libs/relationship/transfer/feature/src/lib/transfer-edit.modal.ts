import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, TransferCollection, TransferModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { convertFormToTransfer, convertTransferToForm } from '@bk2/relationship-transfer-util';

import { TransferFormComponent } from './transfer.form';

@Component({
  selector: 'bk-transfer-edit-modal',
  standalone: true,
  imports: [HeaderComponent, ChangeConfirmationComponent, TransferFormComponent, CommentsAccordionComponent, TranslatePipe, AsyncPipe, IonContent, IonAccordionGroup],
  template: `
    <bk-header title="{{ '@transfer.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
    <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-transfer-form [(vm)]="vm" (validChange)="formIsValid.set($event)" />

      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
      <ion-accordion-group value="comments">
        <bk-comments-accordion [collectionName]="transferCollection" [parentKey]="transferKey()" />
      </ion-accordion-group>
      }
    </ion-content>
  `,
})
export class TransferEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public transfer = input.required<TransferModel>();

  public vm = linkedSignal(() => convertTransferToForm(this.transfer()));
  protected readonly transferKey = computed(() => this.transfer().bkey ?? '');

  protected formIsValid = signal(false);
  protected transferCollection = TransferCollection;

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToTransfer(this.transfer(), this.vm(), this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
