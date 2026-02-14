import { isPlatformBrowser } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonLabel } from '@ionic/angular/standalone';

import { EmptyListComponent, MoreButton, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { debugMessage, hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { TaskModel, TasksConfig, TasksSection } from '@bk2/shared-models';

import { AvatarPipe } from '@bk2/avatar-ui';
import { TasksStore } from './tasks-section.store';


@Component({
  selector: 'bk-tasks-section',
  standalone: true,
  styles: [
    `
      ion-card-content {
        padding: 0px;
      }
      ion-card {
        padding: 0px;
        margin: 0px;
        border: 0px;
        box-shadow: none !important;
      }
      ion-label { font-size: 1em; }
      ion-icon { font-size: 28px; width: 28px; height: 28px; }
    `,
  ],
  providers: [TasksStore], 
  imports: [
    SvgIconPipe, PrettyDatePipe, AvatarPipe,
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent, MoreButton,
    IonCard, IonCardContent, IonLabel
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if(isLoading()) {
    <bk-spinner />
    } @else {        
        <ion-card>
            <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
            <ion-card-content>
                @if(numberOfTasks() === 0) {
                    <bk-empty-list message="@task.field.empty-my" />
                } @else {
                    <ion-list lines="inset">
                        @for(task of tasks(); track $index) {
                            <ion-item (click)="showActions(task)">
                                <ion-icon src="{{ getIcon(task) | svgIcon }}" />
                                <div class="tags ion-hide-md-down">
                                @for (tag of task.tags.split(','); track tag) {
                                    @if(tag.length > 0) {
                                    <ion-chip color="primary">
                                        <ion-label>{{ tag }}</ion-label>
                                    </ion-chip>
                                    }
                                }
                                </div>
                                <ion-label class="name">{{ task.name }}</ion-label>
                                @if(task.dueDate.length > 0) {
                                <ion-label>{{ task.dueDate | prettyDate }}</ion-label>
                                }
                                @if(task.assignee !== undefined) {
                                <ion-avatar>
                                    <ion-img src="{{ task.assignee.modelType + '.' + task.assignee.key | avatar }}" alt="Avatar of the assigned person" />
                                </ion-avatar>
                                }
                            </ion-item>
                        }
                        @if(showMoreButton() && !editMode()) {
                          <bk-more-button [url]="moreUrl()" />
                        }
                    </ion-list>
                }
            </ion-card-content>
        </ion-card>
    }
  `,
})
export class TasksSectionComponent implements OnInit {
  protected tasksStore = inject(TasksStore);
  private readonly platformId = inject(PLATFORM_ID);
  private actionSheetController = inject(ActionSheetController);
  
  // inputs
  public section = input<TasksSection>();
  public editMode = input<boolean>(false);

  // derived values
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly config = computed(() => this.section()?.properties as TasksConfig | undefined);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');
  protected readonly showMoreButton = computed(() => this.moreUrl().length > 0);
  protected readonly maxItems = computed(() => this.config()?.maxItems ?? undefined); // undefined = show all tasks
  protected readonly tasks = computed(() => this.tasksStore.tasks());
  protected readonly numberOfTasks = computed(() => this.tasks().length);
  protected currentUser = computed(() => this.tasksStore.currentUser());
  protected isLoading = computed(() => false);

  private imgixBaseUrl = this.tasksStore.appStore.env.services.imgixBaseUrl;

   constructor() {
    effect(() => {
      this.tasksStore.setConfig(this.maxItems());
      debugMessage(`TasksSection(): maxItems=${this.maxItems()}`, this.currentUser());
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // angular component calls render() from ngAfterViewInit() which is too early for fullcalendar in Ionic (should be in ionViewDidLoad())
      // the calendar renders correctly if render() is called after the page is loaded, e.g. by resizing the window.
      // that's what this hack is doing: trigger resize window after 1ms
      setTimeout( () => {
        if (isPlatformBrowser(this.platformId)) {
          window.dispatchEvent(new Event('resize'));
        }
      }, 1);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Task. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param task 
   */
  protected async showActions(task: TaskModel): Promise<void> {
    if (this.editMode()) return;
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, task);
    await this.executeActions(actionSheetOptions, task);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param task 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, task: TaskModel): void {
    if (hasRole('registered', this.currentUser())) {
        if (task.completionDate.length === 0) { // task is not yet completed.
            actionSheetOptions.buttons.push(createActionSheetButton('task.complete', this.imgixBaseUrl, 'checkbox-circle'));
        }
        actionSheetOptions.buttons.push(createActionSheetButton('task.view', this.imgixBaseUrl, 'eye-on'));
    }
    if (hasRole('eventAdmin', this.currentUser()) || hasRole('privileged', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('task.edit', this.imgixBaseUrl, 'create_edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param task 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, task: TaskModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'task.complete':
            await this.tasksStore.setCompleted(task, false);
            break;
        case 'task.view':
            await this.tasksStore.edit(task, true);
            break;
        case 'task.edit':
            await this.tasksStore.edit(task, false);
            break;
      }
    }
  }

  protected getIcon(task: TaskModel): string {
    return task.completionDate.length > 0 ? 'checkbox-circle' : 'circle';
  }
}
