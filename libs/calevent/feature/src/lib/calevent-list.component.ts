import { Component, computed, effect, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar, IonItemSliding, IonItemOptions, IonItemOption, IonList, IonPopover } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { AllCategories, CalEventModel, RoleName } from '@bk2/shared/models';
import { addAllCategory, CalEventTypes } from '@bk2/shared/categories';
import { hasRole } from '@bk2/shared/util-core';
import { error } from '@bk2/shared/util-angular';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { CalEventDurationPipe } from '@bk2/calevent/util';
import { CalEventListStore } from './calevent-list.store';

@Component({
    selector: 'bk-calevent-list',
    imports: [
      TranslatePipe, AsyncPipe, CalEventDurationPipe, SvgIconPipe,
      SpinnerComponent, EmptyListComponent,
      MenuComponent, ListFilterComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
      IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem,
      IonItemOptions, IonItemOption, IonList, IonPopover
    ],
    providers: [CalEventListStore],
    template: `
    <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedCalEventsCount()}}/{{calEventsCount()}} {{ '@calEvent.plural' | translate | async }}</ion-title>
      @if(hasRole('privileged') || hasRole('eventAdmin')) {
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
      [tags]="calEventTags()"
      [types]="calEventTypes"
      typeName="calEventType"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeChange($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
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
      @if(selectedCalEventsCount() === 0) {
        <bk-empty-list message="@calEvent.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(event of filteredCalEvents(); track event.bkey) {
            <ion-item-sliding #slidingItem>
              <ion-item (click)="edit(undefined, event)">
                <ion-label>{{event.name}}</ion-label>      
                <ion-label>{{ event | calEventDuration }}</ion-label>
              </ion-item>
              @if(hasRole('privileged') || hasRole('eventAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="edit(slidingItem, event)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="primary" (click)="delete(slidingItem, event)">
                    <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                  </ion-item-option>
                </ion-item-options>
              }
            </ion-item-sliding>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class CalEventListComponent {
  protected calEventListStore = inject(CalEventListStore);

  public listId = input.required<string>();     // calendar name
  public contextMenuName = input.required<string>();

  protected filteredCalEvents = computed(() => this.calEventListStore.filteredCalEvents() ?? []);
  protected calEventsCount = computed(() => this.calEventListStore.calEventsCount());
  protected selectedCalEventsCount = computed(() => this.filteredCalEvents().length);
  protected isLoading = computed(() => this.calEventListStore.isLoading());
  protected calEventTags = computed(() => this.calEventListStore.getTags());
  protected popupId = computed(() => `c_calevent_${this.listId}`);

  protected selectedCategory = AllCategories;
  protected calEventTypes = addAllCategory(CalEventTypes);

  constructor() {
    effect(() => this.calEventListStore.setCalendarName(this.listId()));
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.calEventListStore.add(); break;
      case 'exportRaw': await this.calEventListStore.export("raw"); break;
      default: error(undefined, `CalEventListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async delete(slidingItem?: IonItemSliding, calEvent?: CalEventModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (calEvent) await this.calEventListStore.delete(calEvent);
  }

  public async edit(slidingItem?: IonItemSliding, calEvent?: CalEventModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (calEvent) await this.calEventListStore.edit(calEvent);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.calEventListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.calEventListStore.setSelectedTag(tag);
  }

  protected onTypeChange(calEventType: number): void {
    this.calEventListStore.setSelectedCategory(calEventType);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.calEventListStore.currentUser());
  }
}
