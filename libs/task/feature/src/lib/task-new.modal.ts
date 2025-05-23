import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { RoleName } from '@bk2/shared/config';
import { AvatarInfo, ModelType } from '@bk2/shared/models';
import { hasRole } from '@bk2/shared/util';

import { AppStore } from '@bk2/auth/feature';
import { TaskFormComponent } from '@bk2/task/ui';
import { convertFormToTask, newTaskFormModel } from '@bk2/task/util';


@Component({
  selector: 'bk-task-new-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent, TaskFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@task.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-task-form [(vm)]="vm" [currentUser]="appStore.currentUser()" [taskTags]="taskTags()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class TaskNewModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public author = input.required<AvatarInfo>();

  public vm = linkedSignal(() => newTaskFormModel(this.author()));
  protected taskTags = computed(() => this.appStore.getTags(ModelType.Task));

  // as we prepared everything with currentPerson and defaultResource, we already have a valid form, so we need to signal this here.
  protected formIsValid = signal(true);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToTask(undefined, this.vm(), this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
