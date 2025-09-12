import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';

import { OrgNewFormComponent } from '@bk2/subject-org-ui';
import { createNewOrgFormModel } from '@bk2/subject-org-util';

@Component({
  selector: 'bk-org-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, OrgNewFormComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@subject.org.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-org-new-form [(vm)]="vm" [currentUser]="currentUser()" [orgTags]="orgTags()" (validChange)="onValidChange($event)" />
    </ion-content>
  `
})
export class OrgNewModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public currentUser = input<UserModel | undefined>();

  public vm = linkedSignal(() => createNewOrgFormModel());
  protected readonly orgTags = computed(() => this.appStore.getTags(ModelType.Org));

  protected formIsValid = signal(false);

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.vm(), 'confirm');
  }

  protected onValidChange(valid: boolean): void {
    this.formIsValid.set(valid);
  }
}
