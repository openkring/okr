import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ActionSheetController } from '@ionic/angular';

import { CalEventModel, RoleName } from '@bk2/shared-models';
import { LabelPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getYear, getYearList, hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';
import { AvatarDisplay } from '@bk2/avatar-ui';

import { CalEventStore } from './calevent.store';

@Component({
    selector: 'bk-yearly-events',
    standalone: true,
    imports: [
    SvgIconPipe, LabelPipe,
    Spinner, EmptyList, Menu, ListFilter, AvatarDisplay,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
],
    providers: [CalEventStore],
    template: `
    <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ filteredCalEventsCount()}}/{{calEventsCount()}} {{ store.i18n.calevents() }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('eventAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-yevents">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-yevents" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-buttons>
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
          <ion-col size="6" size-md="4" size-lg="3">
            <ion-label><strong>{{ store.i18n.year() }}</strong></ion-label>
          </ion-col>
          <ion-col size-md="4" size-lg="3" class="ion-hide-md-down">
            <ion-label><strong>{{ store.i18n.responsible() }}</strong></ion-label>
          </ion-col>
          <ion-col size="6" size-md="4" size-lg="3">
            <ion-label><strong>{{ store.i18n.location() }}</strong></ion-label>
          </ion-col>
          <ion-col size-lg="3" class="ion-hide-lg-down">
            <ion-label><strong>{{ store.i18n.description() }}</strong></ion-label>
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
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(event of filteredCalEvents(); track event.bkey) {
            <ion-item (click)="showActions(event)">
              <ion-label>{{event.name}}</ion-label>
              <ion-label class="ion-hide-md-down"><bk-avatar-display [avatars]="event.responsiblePersons" [showName]="true" /></ion-label>
              <ion-label class="ion-hide-md-up"><bk-avatar-display [avatars]="event.responsiblePersons" [showName]="false" /></ion-label>
              <ion-label>{{ event.locationKey | label }}</ion-label>
              <ion-label class="ion-hide-lg-down">{{ event.description }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class YearlyEvents {
  protected store = inject(CalEventStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public listId = input.required<string>();     // calendar name
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedCategory());

  // data
  protected calEventsCount = computed(() => this.store.calEventsCount());
  protected filteredCalEvents = computed(() => this.store.filteredCalEvents() ?? []);
  protected filteredCalEventsCount = computed(() => this.filteredCalEvents().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('calevent_type'));
  private currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('eventAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));
  protected readonly years = computed(() => getYearList(getYear(), 30));

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setCalendarName(this.listId()));
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `YearlyEvents.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a CalEvent. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param calEvent 
   */
  protected async showActions(calEvent: CalEventModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions, calEvent);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('album', this.store.i18n.view_album(), this.imgixBaseUrl, 'albums'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
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
          await this.store.delete(calEvent, this.readOnly());
          break;
        case 'calevent.edit':
          await this.store.edit(calEvent, false, this.readOnly());
          break;
        case 'calevent.view':
          await this.store.edit(calEvent, false, true);
          break;
        case 'album':
          await this.store.showAlbum(calEvent.url);
          break;
      }
    }
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.store.setSelectedTag($event);
  }

  protected onTypeSelected(calEventType: string): void {
    this.store.setSelectedCategory(calEventType);
  }

  protected onYearSelected(year: number): void {
    this.store.setSelectedYear(year);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
