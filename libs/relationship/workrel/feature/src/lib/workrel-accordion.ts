import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonLabel, IonList, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { RoleName, WorkrelModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList } from '@bk2/shared-ui';
import { hasRole, isOngoing } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';
import { WorkrelNamePipe } from '@bk2/relationship-workrel-util';

import { WorkrelStore } from './workrel.store';

@Component({
  selector: 'bk-workrel-accordion',
  standalone: true,
  imports: [
    AvatarPipe, FullNamePipe, SvgIconPipe, WorkrelNamePipe, AsyncPipe,
    EmptyList,
    IonAccordion, IonItem, IonLabel, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonImg, IonButton, IonIcon
  ],
  providers: [WorkrelStore],
  styles: [`
    .list-avatar { margin-top: 0px; margin-bottom: 0px; width: 30px; height: 30px; }
    `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="workrels">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ accordionTitle() }}</ion-label>
      @if(hasRole('memberAdmin') && readOnly() === false) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(workRels().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(workrel of workRels(); track $index) {
            <ion-grid (click)="showActions(workrel)">
              <ion-row>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start" class="list-avatar">
                      <ion-img src="{{ 'person.' + workrel.subjectKey | avatar }}" alt="avatar of person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workrel.subjectName1 | fullName:workrel.subjectName2}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-item lines="none">
                    <ion-label>{{ workrel | workrelName:types() | async }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start" class="list-avatar">
                      <ion-img src="{{ 'org.' + workrel.objectKey | avatar }}" alt="logo of organization" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workrel.objectName }}</ion-label>
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
export class WorkrelAccordion {
  protected readonly store = inject(WorkrelStore);
  private actionSheetController = inject(ActionSheetController);

  public personKey = input<string>();
  public color = input('light');
  public title = input<string | undefined>();
  public readOnly = input(true);
  protected types = computed(() => this.store.appStore.getCategory('workrel_type'));
  
  protected workRels = computed(() => this.store.allWorkrels());  // tbd: better define: a) all, b) open c) current year ...
  protected currentUser = computed(() => this.store.appStore.currentUser());
  protected accordionTitle = computed(() => this.title() ?? this.store.i18n.workrels());
  
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      if (this.personKey()) {
        this.store.setPersonKey(this.personKey() ?? '');
      }
    });
    effect(() => this.store.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.store.add();
  }

  /**
   * Displays an ActionSheet with all possible actions on a Work Relationship. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param workRel 
   */
  protected async showActions(workRel: WorkrelModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, workRel);
    await this.executeActions(actionSheetOptions, workRel);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param workRel 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, workRel: WorkrelModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }

    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(workRel.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endrel', this.store.i18n.end(), this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param workRel 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, workRel: WorkrelModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'delete':
          await this.store.delete(workRel, this.readOnly());
          break;
        case 'edit':
          await this.store.edit(workRel, this.readOnly());
          break;
        case 'view':
          await this.store.edit(workRel, true);
          break;
        case 'endrel':
          await this.store.end(workRel, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected isOngoing(workRel: WorkrelModel): boolean {
    return isOngoing(workRel.validTo);
  }
}
