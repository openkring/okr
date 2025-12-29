import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, WorkrelModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';
import { WorkrelNamePipe } from '@bk2/relationship-workrel-util';

import { WorkrelStore } from './workrel.store';

@Component({
  selector: 'bk-workrel-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe, WorkrelNamePipe,
    ListFilterComponent, EmptyListComponent, SpinnerComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonImg, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonPopover
  ],
  providers: [WorkrelStore],
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
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
      (stateChanged)="onStateSelected($event)" [states]="states()"
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
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'person.' + workrel.subjectKey | avatar | async}}" alt="avatar of first person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workrel.subjectName1 | fullName:workrel.subjectName2}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="6" size-md="4">
                  <ion-item lines="none">
                    <ion-label>{{ workrel | workrelName:types() }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="4">
                  <ion-item lines="none">
                    <ion-avatar slot="start">
                      <ion-img src="{{ 'org.' + workrel.objectKey | avatar | async}}" alt="avatar of second person" />
                    </ion-avatar>
                    <ion-label class="ion-hide-md-down">{{workrel.objectName }}</ion-label>
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
  protected workrelStore = inject(WorkrelStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.workrelStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.workrelStore.selectedTag());
  protected selectedType = linkedSignal(() => this.workrelStore.selectedType());
  protected selectedState = linkedSignal(() => this.workrelStore.selectedState());

  // data
  protected filteredWorkRels = computed(() => this.workrelStore.filteredWorkrels());
  protected allWorkRels = computed(() => this.workrelStore.allWorkrels());
  protected workRelsCount = computed(() => this.workrelStore.allWorkrels()?.length ?? 0);
  protected selectedWorkRelsCount = computed(() => this.filteredWorkRels()?.length ?? 0);
  protected isLoading = computed(() => this.workrelStore.isLoading());
  protected tags = computed(() => this.workrelStore.getTags());
  protected types = computed(() => this.workrelStore.appStore.getCategory('workrel_type'));
  protected states = computed(() => this.workrelStore.appStore.getCategory('workrel_state'));
  protected currentUser = computed(() => this.workrelStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  private imgixBaseUrl = this.workrelStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.workrelStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.workrelStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.workrelStore.setSelectedType(type);
  }

  protected onStateSelected(state: string): void {
    this.workrelStore.setSelectedState(state);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.workrelStore.add(this.readOnly()); break;
      case 'exportRaw': await this.workrelStore.export('raw'); break;
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
      if (hasRole('registered', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('workrel.view', this.imgixBaseUrl, 'eye-on'));
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
      }
      if (!(this.readOnly())) {
        actionSheetOptions.buttons.push(createActionSheetButton('workrel.edit', this.imgixBaseUrl, 'create_edit'));
        if (isOngoing(workRel.validTo)) {
          actionSheetOptions.buttons.push(createActionSheetButton('workrel.end', this.imgixBaseUrl, 'stop-circle'));
        }
      }
      if (hasRole('admin', this.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('workrel.delete', this.imgixBaseUrl, 'trash_delete'));
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
          case 'workrel.delete':
            await this.workrelStore.delete(workRel, this.readOnly());
            break;
          case 'workrel.edit':
            await this.workrelStore.edit(workRel, this.readOnly());
            break;
          case 'workrel.view':
            await this.workrelStore.edit(workRel, true);
            break;
          case 'workrel.end':
            await this.workrelStore.end(workRel, this.readOnly());
            break;
        }
      }
    }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.workrelStore.currentUser());
  }

  protected isOngoing(workrel: WorkrelModel): boolean {
    return isOngoing(workrel.validTo);
  }
}
