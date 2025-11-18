import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonLabel, IonList, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { PersonalRelModel, RoleName } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { PersonalRelAccordionStore } from './personal-rel-accordion.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-personal-rel-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonButton,
    IonImg, IonGrid, IonRow, IonCol, IonAvatar
  ],
  providers: [PersonalRelAccordionStore],
  styles: [`
    .list-avatar { margin-top: 0px; margin-bottom: 0px; width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="personalRels">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(readOnly() === false) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(relsCount() === 0) {
        <bk-empty-list message="@personalRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(personalRel of personalRels(); track $index) {
            <ion-grid (click)="showActions(personalRel)">
              <ion-row>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start" class="list-avatar">
                      <ion-img src="{{ 'person.' + personalRel.subjectKey | avatar:'person' | async}}" alt="avatar of first person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{personalRel.subjectFirstName | fullName:personalRel.subjectLastName}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-item lines="none">
                    <ion-label>{{ personalRel.type }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start" class="list-avatar">
                      <ion-img src="{{ 'person.' + personalRel.objectKey | avatar:'person' | async}}" alt="avatar of second person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{personalRel.objectFirstName | fullName:personalRel.objectLastName}}</ion-label>
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
export class PersonalRelAccordionComponent {
  protected readonly personalRelStore = inject(PersonalRelAccordionStore);
  private actionSheetController = inject(ActionSheetController);

  public personKey = input.required<string>();
  public color = input('light');
  public title = input('@personalRel.plural');
  public readOnly = input(true);

  protected personalRels = computed(() => this.personalRelStore.allPersonalRels());  // tbd: better define: a) all, b) open c) current year ...
  protected relsCount = computed(() => this.personalRels().length);

  private imgixBaseUrl = this.personalRelStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      if (this.personKey() && this.personKey().length > 0) {
        this.personalRelStore.setPersonKey(this.personKey());
      }
    });
    effect(() => this.personalRelStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.personalRelStore.add();
  }

  /**
   * Displays an ActionSheet with all possible actions on a Personal Relationship. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param personalRel 
   */
  protected async showActions(personalRel: PersonalRelModel): Promise<void> {
    if (this.readOnly() === false) {
      const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      this.addActionSheetButtons(actionSheetOptions, personalRel);
      await this.executeActions(actionSheetOptions, personalRel);
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param personalRel 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, personalRel: PersonalRelModel): void {
    if (hasRole('memberAdmin', this.personalRelStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(personalRel.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endrel', this.imgixBaseUrl, 'stop-circle'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (hasRole('admin', this.personalRelStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param personalRel 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, personalRel: PersonalRelModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.personalRelStore.delete(personalRel, this.readOnly());
          break;
        case 'edit':
          await this.personalRelStore.edit(personalRel, this.readOnly());
          break;
        case 'endrel':
          await this.personalRelStore.end(personalRel, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.personalRelStore.currentUser());
  }

  protected isOngoing(personalRel: PersonalRelModel): boolean {
    return isOngoing(personalRel.validTo);
  }
}
