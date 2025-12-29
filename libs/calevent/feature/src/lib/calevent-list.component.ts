import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { CalEventModel, RoleName } from '@bk2/shared-models';
import { PartPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYear, getYearList, hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { AvatarDisplayComponent } from '@bk2/avatar-ui';

import { CalEventDurationPipe } from '@bk2/calevent-util';
import { CalEventStore } from './calevent.store';

@Component({
    selector: 'bk-calevent-list',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe, CalEventDurationPipe, SvgIconPipe, PartPipe,
      SpinnerComponent, EmptyListComponent, AvatarDisplayComponent,
      MenuComponent, ListFilterComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
    ],
    providers: [CalEventStore],
    template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCalEventsCount()}}/{{calEventsCount()}} {{ '@calevent.plural' | translate | async }}</ion-title>
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
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
      (yearChanged)="onYearSelected($event)" [years]="years()"
    />

    <!-- list header -->
    <ion-toolbar color="light">
      <ion-grid>
        <ion-row>
          <ion-col size="6" size-md="3">
            <ion-label><strong>{{ '@calevent.list.header.duration' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="6" size-md="4">
            <ion-label><strong>{{ '@calevent.list.header.name' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="3" class="ion-hide-md-down">
            <ion-label><strong>{{ '@calevent.list.header.location' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="2" class="ion-hide-md-down">
            <ion-label><strong>{{ '@calevent.list.header.responsible' | translate | async }}</strong></ion-label>
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
        <bk-empty-list message="@calevent.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(event of filteredCalEvents(); track event.bkey) {
            <ion-item (click)="showActions(event)">
              <ion-label>{{ event | calEventDuration }}</ion-label>
              <ion-label>{{event.name}}</ion-label>
              <ion-label class="ion-hide-md-down">{{ event.locationKey | part:true }}</ion-label>
              <ion-label class="ion-hide-md-down"><bk-avatar-display [avatars]="event.responsiblePersons" /></ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class CalEventListComponent {
  protected calEventStore = inject(CalEventStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();     // calendar name
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.calEventStore.searchTerm());
  protected selectedTag = linkedSignal(() => this.calEventStore.selectedTag());
  protected selectedType = linkedSignal(() => this.calEventStore.selectedCategory());

  // data
  protected calEventsCount = computed(() => this.calEventStore.calEventsCount());
  protected filteredCalEvents = computed(() => this.calEventStore.filteredCalEvents() ?? []);
  protected filteredCalEventsCount = computed(() => this.filteredCalEvents().length);
  protected isLoading = computed(() => this.calEventStore.isLoading());
  protected tags = computed(() => this.calEventStore.getTags());
  protected popupId = computed(() => `c_calevent_${this.listId}`);
  protected types = computed(() => this.calEventStore.appStore.getCategory('calevent_type'));
  private currentUser = computed(() => this.calEventStore.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('eventAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));
  protected readonly years = computed(() => getYearList(getYear(), 30));

  // passing constants to the template
  private imgixBaseUrl = this.calEventStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.calEventStore.setCalendarName(this.listId()));
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.calEventStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.calEventStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.calEventStore.setSelectedCategory(type);
  }

  protected onYearSelected(year: number): void {
    this.calEventStore.setSelectedYear(year);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.calEventStore.edit(undefined, this.readOnly()); break;
      case 'exportRaw': await this.calEventStore.export("raw"); break;
      default: error(undefined, `CalEventListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
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
          await this.calEventStore.delete(calEvent, this.readOnly());
          break;
        case 'calevent.edit':
          await this.calEventStore.edit(calEvent, this.readOnly());
          break;
        case 'calevent.view':
          await this.calEventStore.edit(calEvent, true);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
