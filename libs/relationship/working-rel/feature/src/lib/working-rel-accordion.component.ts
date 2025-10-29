import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonLabel, IonList, IonRow } from '@ionic/angular/standalone';

import { WorkingRelTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, RoleName, WorkingRelModel } from '@bk2/shared-models';
import { CategoryNamePipe, FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { WorkingRelAccordionStore } from './working-rel-accordion.store';

import { AvatarPipe } from '@bk2/avatar-ui';
import { ActionSheetController } from '@ionic/angular';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-working-rel-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, AvatarPipe, FullNamePipe, CategoryNamePipe, SvgIconPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonImg, IonButton, IonIcon
  ],
  providers: [WorkingRelAccordionStore],
  styles: [`
    .list-avatar { margin-top: 0px; margin-bottom: 0px; width: 30px; height: 30px; }
    `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="workingRels">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('memberAdmin')) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(workRels().length === 0) {
        <bk-empty-list message="@workingRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(workingRel of workRels(); track $index) {
            <ion-grid (click)="showActions(workingRel)">
              <ion-row>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start" class="list-avatar">
                      <ion-img src="{{ modelType.Person + '.' + workingRel.subjectKey | avatar | async}}" alt="avatar of person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workingRel.subjectName1 | fullName:workingRel.subjectName2}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-item lines="none">
                    <ion-label>{{ workingRel.type | categoryName:workRelTypes }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start" class="list-avatar">
                      <ion-img src="{{ modelType.Org + '.' + workingRel.objectKey | avatar | async}}" alt="logo of organization" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workingRel.objectName }}</ion-label>
                  </ion-item> 
                </ion-col>
              </ion-row>
            </ion-grid>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class WorkingRelAccordionComponent {
  protected readonly workRelStore = inject(WorkingRelAccordionStore);
  private actionSheetController = inject(ActionSheetController);

  public personKey = input<string>();
  public color = input('light');
  public title = input('@workingRel.plural');

  protected workRels = computed(() => this.workRelStore.allWorkingRels());  // tbd: better define: a) all, b) open c) current year ...

  protected modelType = ModelType;
  protected workRelTypes = WorkingRelTypes;
  private imgixBaseUrl = this.workRelStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      if (this.personKey()) {
        this.workRelStore.setPersonKey(this.personKey() ?? '');
      }
    });
    effect(() => this.workRelStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.workRelStore.add();
  }

  /**
   * Displays an ActionSheet with all possible actions on a Work Relationship. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param workRel 
   */
  protected async showActions(workRel: WorkingRelModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, workRel);
    await this.executeActions(actionSheetOptions, workRel);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param workRel 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, workRel: WorkingRelModel): void {
    if (hasRole('memberAdmin', this.workRelStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(workRel.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endrel', this.imgixBaseUrl, 'stop-circle'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.workRelStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param workRel 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, workRel: WorkingRelModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.workRelStore.delete(workRel);
          break;
        case 'edit':
          await this.workRelStore.edit(workRel);
          break;
        case 'endrel':
          await this.workRelStore.end(workRel);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.workRelStore.currentUser());
  }

  protected isOngoing(workRel: WorkingRelModel): boolean {
    return isOngoing(workRel.validTo);
  }
}
