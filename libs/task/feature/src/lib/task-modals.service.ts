import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AvatarInfo, TaskModel } from "@bk2/shared/models";
import { AppStore } from '@bk2/shared/feature';

import { TaskService } from "@bk2/task/data-access";
import { isTask } from "@bk2/task/util";
import { TaskNewModalComponent } from "./task-new.modal";
import { TaskEditModalComponent } from "./task-edit.modal";


@Injectable({
    providedIn: 'root'
})
export class TaskModalsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly taskService = inject(TaskService);
  
  private readonly tenantId = this.appStore.tenantId();
  
 /**
   * Show a modal to add a new task.
   * @param author the person that creates the task
   */
   public async add(author: AvatarInfo, calendarName: string): Promise<void> {
    const _modal = await this.modalController.create({
      component: TaskNewModalComponent,
      cssClass: 'small-modal',
      componentProps: {
        author: author
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isTask(data, this.tenantId)) {
        data.calendars = [calendarName];
        console.log('TaskModalsService.add: ', data);
        await this.taskService.create(data, this.appStore.currentUser());
      }
    }
  }

  /**
   * Show a modal to edit an existing task.
   * @param task the task to edit
   */
  public async edit(task?: TaskModel): Promise<void> {
    task ??= new TaskModel(this.tenantId);
    
    const _modal = await this.modalController.create({
      component: TaskEditModalComponent,
      componentProps: {
        task: task
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isTask(data, this.tenantId)) {
        await (!data.bkey ? this.taskService.create(data, this.appStore.currentUser()) : this.taskService.update(data));
      }
    }
  }
}
