import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CalEventModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { CalEventDurationPipe } from '@bk2/calevent-util';
import { CalEventListStore } from './calevent-list.store';
@Component({
    selector: 'bk-calevent-list',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe, CalEventDurationPipe, SvgIconPipe,
      SpinnerComponent, EmptyListComponent,
      MenuComponent, ListFilterComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    providers: [CalEventListStore],
    template: `
    <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ filteredCalEventsCount()}}/{{calEventsCount()}} {{ '@calEvent.plural' | translate | async }}</ion-title>
      @if(!readOnly()) {
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="tags()" (tagChanged)="onTagSelected($event)"
      [type]="types()" (typeChanged)="onTypeChange($event)"
      (searchTermChanged)="onSearchtermChange($event)"
    />

    <!-- list header -->
    <ion-toolbar color="light">
      <ion-grid>
        <ion-row>
          <ion-col size="12" size-md="6">
            <ion-label><strong>{{ '@calEvent.list.header.name' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="12" size-md="6">
            <ion-label><strong>{{ '@calEvent.list.header.duration' | translate | async }}</strong></ion-label>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      @if(filteredCalEventsCount() === 0) {
        <bk-empty-list message="@calEvent.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(event of filteredCalEvents(); track event.bkey) {
            <ion-item (click)="showActions(event)">
              <ion-label>{{event.name}}</ion-label>      
              <ion-label>{{ event | calEventDuration }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class CalEventListComponent {
  protected calEventListStore = inject(CalEventListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();     // calendar name
  public contextMenuName = input.required<string>();

  protected calEventsCount = computed(() => this.calEventListStore.calEventsCount());
  protected filteredCalEvents = computed(() => this.calEventListStore.filteredCalEvents() ?? []);
  protected filteredCalEventsCount = computed(() => this.filteredCalEvents().length);
  protected isLoading = computed(() => this.calEventListStore.isLoading());
  protected tags = computed(() => this.calEventListStore.getTags());
  protected popupId = computed(() => `c_calevent_${this.listId}`);
  protected types = computed(() => this.calEventListStore.appStore.getCategory('calevent_type'));
  private currentUser = computed(() => this.calEventListStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('eventAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));

  private imgixBaseUrl = this.calEventListStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.calEventListStore.setCalendarName(this.listId()));
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.calEventListStore.edit(undefined, this.readOnly()); break;
      case 'exportRaw': await this.calEventListStore.export("raw"); break;
      default: error(undefined, `CalEventListComponent.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a CalEvent. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param calEvent 
   */
  protected async showActions(calEvent: CalEventModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, calEvent);
    await this.executeActions(actionSheetOptions, calEvent);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param calEvent 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, calEvent: CalEventModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.delete', this.imgixBaseUrl, 'trash_delete'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param calEvent 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, calEvent: CalEventModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'calevent.delete':
          await this.calEventListStore.delete(calEvent, this.readOnly());
          break;
        case 'calevent.edit':
          await this.calEventListStore.edit(calEvent, this.readOnly());
          break;
        case 'calevent.view':
          await this.calEventListStore.edit(calEvent, true);
          break;
      }
    }
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.calEventListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.calEventListStore.setSelectedTag(tag);
  }

  protected onTypeChange(calEventType: string): void {
    this.calEventListStore.setSelectedCategory(calEventType);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.calEventListStore.currentUser());
  }
}
