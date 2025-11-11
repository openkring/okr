import { AsyncPipe } from '@angular/common';
import { Component, inject, input, linkedSignal, OnInit, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AccountModel, OrgModel, PersonModel, ResourceModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { newOwnership } from '@bk2/relationship-ownership-util';
import { OwnershipNewFormComponent } from './ownership-new.form';

@Component({
  selector: 'bk-ownership-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, OwnershipNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@ownership.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-ownership-new-form [(vm)]="vm" [currentUser]="currentUser()" (validChange)="onValidChange($event)" />
    </ion-content>
  `
})
export class OwnershipNewModalComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public owner = input.required<PersonModel | OrgModel>();
  public resource = input.required<ResourceModel | AccountModel>(); 
  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => newOwnership(this.owner(), this.resource(), this.appStore.tenantId()));
  protected formIsValid = signal(false);

  ngOnInit() {
    // as we prepared everything with defaultMember and defaultOrg, we already have a valid form, so we need to signal this here.
    this.onValidChange(true);
  }

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }

  protected onValidChange(valid: boolean): void {
    this.formIsValid.set(valid);
  }
}
