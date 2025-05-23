import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ModelType, TaskCollection, TaskModel } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';

import { AppStore } from '@bk2/auth/feature';
import { CommentsAccordionComponent } from '@bk2/comment/feature';

import { TaskFormComponent } from '@bk2/task/ui';
import { convertFormToTask, convertTaskToForm } from '@bk2/task/util';

@Component({
  selector: 'bk-task-edit-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent, TaskFormComponent, CommentsAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ '@task.operation.update.label' | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-task-form [(vm)]="vm" [currentUser]="appStore.currentUser()" [taskTags]="taskTags()" (validChange)="formIsValid.set($event)" />
      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="collectionName" [parentKey]="key()" />
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class TaskEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public task = input.required<TaskModel>();
  
  public vm = linkedSignal(() => convertTaskToForm(this.task()));
  protected taskTags = computed(() => this.appStore.getTags(ModelType.Task));
  protected key = computed(() => this.task().bkey);

  protected formIsValid = signal(false);
  protected collectionName = TaskCollection;

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToTask(this.task(), this.vm(), this.appStore.tenantId()), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
