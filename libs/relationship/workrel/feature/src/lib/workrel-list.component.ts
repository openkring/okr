import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, WorkrelModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { WorkrelListStore } from './workrel-list.store';
import { ActionSheetController } from '@ionic/angular';

@Component({
  selector: 'bk-workrel-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe,
    ListFilterComponent, EmptyListComponent, SpinnerComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonImg, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonPopover
  ],
  providers: [WorkrelListStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedWorkRelsCount()}}/{{workRelsCount()}} {{ '@workrel.list.title' | translate | async }}</ion-title>
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
      [tags]="tags()" (tagChanged)="onTagSelected($event)"
      [type]="types()" (typeChanged)="onTypeSelected($event)"
      [state]="states()" (stateChanged)="onStateSelected($event)"
      (searchTermChanged)="onSearchtermChange($event)"
      [showIcons]=false
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{'@workrel.list.header.subject' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@workrel.list.header.type' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@workrel.list.header.object' | translate | async}}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading() === true) {
      <bk-spinner />
    } @else {
      @if(selectedWorkRelsCount() === 0) {
        <bk-empty-list message="@workrel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(workrel of filteredWorkRels(); track $index) {
            <ion-grid (click)="showActions(workrel)">
              <ion-row>
                <ion-col size="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'person.' + workrel.subjectKey | avatar | async}}" alt="avatar of first person" />
                    </ion-avatar>
                    <ion-label>{{workrel.subjectName1 | fullName:workrel.subjectName2}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="4">
                  <ion-item lines="none">
                    <ion-label>{{ workrel.type }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'org.' + workrel.objectKey | avatar | async}}" alt="avatar of second person" />
                    </ion-avatar>
                    <ion-label>{{workrel.objectName }}</ion-label>
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
export class WorkrelListComponent {
  protected workrelListStore = inject(WorkrelListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredWorkRels = computed(() => this.workrelListStore.filteredWorkrels());
  protected allWorkRels = computed(() => this.workrelListStore.allWorkrels());
  protected workRelsCount = computed(() => this.workrelListStore.allWorkrels()?.length ?? 0);
  protected selectedWorkRelsCount = computed(() => this.filteredWorkRels()?.length ?? 0);
  protected isLoading = computed(() => this.workrelListStore.isLoading());
  protected tags = computed(() => this.workrelListStore.getTags());
  protected types = computed(() => this.workrelListStore.appStore.getCategory('workrel_type'));
  protected states = computed(() => this.workrelListStore.appStore.getCategory('workrel_state'));

  private imgixBaseUrl = this.workrelListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.workrelListStore.add(); break;
      case 'exportRaw': await this.workrelListStore.export('raw'); break;
      default: error(undefined, `WorkrelListComponent.call: unknown method ${selectedMethod}`);
    }
  }

    /**
     * Displays an ActionSheet with all possible actions on a Work Relationship. Only actions are shown, that the user has permission for.
     * After user selected an action this action is executed.
     * @param workRel 
     */
    protected async showActions(workRel: WorkrelModel): Promise<void> {
      const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      this.addActionSheetButtons(actionSheetOptions, workRel);
      await this.executeActions(actionSheetOptions, workRel);
    }
  
    /**
     * Fills the ActionSheet with all possible actions, considering the user permissions.
     * @param workRel 
     */
    private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, workRel: WorkrelModel): void {
      if (hasRole('memberAdmin', this.workrelListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
        if (isOngoing(workRel.validTo)) {
          actionSheetOptions.buttons.push(createActionSheetButton('endrel', this.imgixBaseUrl, 'stop-circle'));
        }
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
      }
      if (hasRole('admin', this.workrelListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
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
        switch (data.action) {
          case 'delete':
            await this.workrelListStore.delete(workRel);
            break;
          case 'edit':
            await this.workrelListStore.edit(workRel);
            break;
          case 'endrel':
            await this.workrelListStore.end(workRel);
            break;
        }
      }
    }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.workrelListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.workrelListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(workrelType: string): void {
    this.workrelListStore.setSelectedType(workrelType);
  }

  protected onStateSelected(workrelState: string): void {
    this.workrelListStore.setSelectedState(workrelState);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.workrelListStore.currentUser());
  }

  protected isOngoing(workrel: WorkrelModel): boolean {
    return isOngoing(workrel.validTo);
  }
}
