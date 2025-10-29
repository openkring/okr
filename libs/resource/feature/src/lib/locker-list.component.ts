import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, GenderTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AllCategories, GenderType, ResourceModel, RoleName } from '@bk2/shared-models';
import { PartPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { ResourceListStore } from './resource-list.store';

@Component({
  selector: 'bk-locker-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, PartPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover,
    IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ResourceListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedLockersCount()}}/{{lockersCount() }} {{ title | translate | async}}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_resource">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_resource" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
            <ng-template>
              <ion-content>
                <bk-menu [menuName]="contextMenuName()"/>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>       
      }
    </ion-toolbar>

    <!-- search and filters -->
    <bk-list-filter 
      [tags]="lockerTags()"
      [types]="allGenders"
      typeName="gender"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
     />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item color="primary" lines="none">
        <ion-label><strong>{{ '@input.lockerNr.label' | translate | async }}</strong></ion-label>
        <ion-label><strong>{{ '@input.keyNr.label' | translate | async }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if(selectedLockersCount() === 0) {
      <bk-empty-list message="@resource.locker.field.empty" />
    } @else {
      <ion-list lines="inset">
        @for(locker of filteredLockers(); track $index) {
          <ion-item class="ion-text-wrap" (click)="showActions(locker)">
            <ion-icon slot="start" src="{{ getIcon(locker) | svgIcon }}" />
            <ion-label>{{ locker.name | part:true:'/' }}</ion-label>
            <ion-label>{{ locker.name | part:false:'/' }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class LockerListComponent {
  protected readonly resourceListStore = inject(ResourceListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredLockers = computed(() => this.resourceListStore.filteredLockers() ?? []);
  protected lockersCount = computed(() => this.resourceListStore.lockersCount());
  protected selectedLockersCount = computed(() => this.filteredLockers().length);
  protected isLoading = computed(() => this.resourceListStore.isLoading());
  protected lockerTags = computed(() => this.resourceListStore.getLockerTags());
  protected title = '@resource.locker.plural';
  
  protected selectedCategory = AllCategories;
  protected allGenders = addAllCategory(GenderTypes);
  private imgixBaseUrl = this.resourceListStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.resourceListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.resourceListStore.setSelectedTag($event);
  }

  protected onTypeSelected(gender: number): void {
    this.resourceListStore.setSelectedGender(gender);
  }

  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string {
    switch(resource.subType) {
      case GenderType.Male: return 'gender_male';
      case GenderType.Female: return 'gender_female';
      case GenderType.Other: return 'gender_diverse';
      default: return 'help';
    }
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.resourceListStore.add(false); break;
      case 'exportRaw': await this.resourceListStore.export("raw"); break;
      default: error(undefined, `LockerListComponent.call: unknown method ${selectedMethod}`);
    }
  }

    /**
     * Displays an ActionSheet with all possible actions on a locker. Only actions are shown, that the user has permission for.
     * After user selected an action this action is executed.
     * @param key 
     */
    protected async showActions(key: ResourceModel): Promise<void> {
      const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      this.addActionSheetButtons(actionSheetOptions, key);
      await this.executeActions(actionSheetOptions, key);
    }
  
    /**
     * Fills the ActionSheet with all possible actions, considering the user permissions.
     * @param key 
     */
    private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, key: ResourceModel): void {
      if (hasRole('resourceAdmin', this.resourceListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
        actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
      }
      if (hasRole('admin', this.resourceListStore.appStore.currentUser())) {
        actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
      }
    }
  
    /**
     * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
     * @param actionSheetOptions 
     * @param key 
     */
    private async executeActions(actionSheetOptions: ActionSheetOptions, key: ResourceModel): Promise<void> {
      if (actionSheetOptions.buttons.length > 0) {
        const actionSheet = await this.actionSheetController.create(actionSheetOptions);
        await actionSheet.present();
        const { data } = await actionSheet.onDidDismiss();
        switch (data.action) {
          case 'delete':
            await this.resourceListStore.delete(key);
            break;
          case 'edit':
            await this.resourceListStore.edit(key);
            break;
        }
      }
    }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.resourceListStore.currentUser());
  }
}

