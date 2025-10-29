import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, WorkingRelStates, WorkingRelTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, RoleName, WorkingRelModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { WorkingRelNamePipe } from '@bk2/relationship-working-rel-util';
import { WorkingRelListStore } from './working-rel-list.store';
import { ActionSheetController } from '@ionic/angular';

@Component({
  selector: 'bk-working-rel-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe, WorkingRelNamePipe,
    ListFilterComponent, EmptyListComponent, SpinnerComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonImg, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonPopover
  ],
  providers: [WorkingRelListStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedWorkRelsCount()}}/{{workRelsCount()}} {{ '@workingRel.list.title' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="c-wrel">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="c-wrel" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                <ng-template>
                  <ion-content>
                    <bk-menu [menuName]="contextMenuName()"/>
                  </ion-content>
                </ng-template>
              </ion-popover>
          </ion-buttons>          }
        </ion-buttons>
      </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      [tags]="workRelTags()"
      [types]="allWorkingRelTypes"
      typeName="workingRelType"
      [states]="allWorkingRelStates"
      stateName="workingRelState"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
      (stateChanged)="onStateSelected($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{'@workingRel.list.header.subject' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@workingRel.list.header.type' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@workingRel.list.header.object' | translate | async}}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading() === true) {
      <bk-spinner />
    } @else {
      @if(selectedWorkRelsCount() === 0) {
        <bk-empty-list message="@workingRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(workingRel of filteredWorkRels(); track $index) {
            <ion-grid (click)="showActions(workingRel)">
              <ion-row>
                <ion-col size="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ modelType.Person + '.' + workingRel.subjectKey | avatar | async}}" alt="avatar of first person" />
                    </ion-avatar>
                    <ion-label>{{workingRel.subjectName1 | fullName:workingRel.subjectName2}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="4">
                  <ion-item lines="none">
                    <ion-label>{{ workingRel.type | workingRelName:workingRel.label }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ modelType.Org + '.' + workingRel.objectKey | avatar | async}}" alt="avatar of second person" />
                    </ion-avatar>
                    <ion-label>{{workingRel.objectName }}</ion-label>
                  </ion-item> 
                </ion-col>
              </ion-row>
            </ion-grid>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class WorkingRelListComponent {
  protected workRelListStore = inject(WorkingRelListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredWorkRels = computed(() => this.workRelListStore.filteredWorkingRels());
  protected allWorkRels = computed(() => this.workRelListStore.allWorkingRels());
  protected workRelsCount = computed(() => this.workRelListStore.allWorkingRels()?.length ?? 0);
  protected selectedWorkRelsCount = computed(() => this.filteredWorkRels()?.length ?? 0);
  protected isLoading = computed(() => this.workRelListStore.isLoading());
  protected workRelTags = computed(() => this.workRelListStore.getTags());

  protected modelType = ModelType;
  protected readonly allWorkingRelTypes = addAllCategory(WorkingRelTypes);
  protected readonly allWorkingRelStates = addAllCategory(WorkingRelStates);
  private imgixBaseUrl = this.workRelListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.workRelListStore.add(); break;
      case 'exportRaw': await this.workRelListStore.export('raw'); break;
      default: error(undefined, `WorkingRelListComponent.call: unknown method ${selectedMethod}`);
    }
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
      if (hasRole('memberAdmin', this.workRelListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
        if (isOngoing(workRel.validTo)) {
          actionSheetOptions.buttons.push(createActionSheetButton('endrel', this.imgixBaseUrl, 'stop-circle'));
        }
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
      }
      if (hasRole('admin', this.workRelListStore.appStore.currentUser())) {
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
            await this.workRelListStore.delete(workRel);
            break;
          case 'edit':
            await this.workRelListStore.edit(workRel);
            break;
          case 'endrel':
            await this.workRelListStore.end(workRel);
            break;
        }
      }
    }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.workRelListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.workRelListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(workingRelType: number): void {
    this.workRelListStore.setSelectedType(workingRelType);
  }

  protected onStateSelected(workingRelState: number): void {
    this.workRelListStore.setSelectedState(workingRelState);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.workRelListStore.currentUser());
  }

  protected isOngoing(workingRel: WorkingRelModel): boolean {
    return isOngoing(workingRel.validTo);
  }
}
