import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { ModelType, UserModel} from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { createNewOrgFormModel } from '@bk2/subject/org/util';
import { OrgNewFormComponent } from '@bk2/subject/org/ui';

@Component({
  selector: 'bk-org-new-modal',
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
