import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';
import { ResourceModel, RoleName } from '@okr/shared-models';
import { TranslatePipe } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { error } from '@okr/shared-util-angular';
import { getCategoryIcon, getItemLabel, hasRole } from '@okr/shared-util-core';

type BoatSortField = 'name' | 'type' | 'load';

import { Menu } from '@okr/cms-menu-feature';

import { OwnershipStore } from '@okr/relationship-ownership-feature';

import { RESOURCE_EDIT_MODAL_PROVIDER } from './resource-edit-modal.provider';
import { ResourceStore } from './resource.store';

@Component({
  selector: 'okr-rowing-boat-list',
  standalone: true,
  imports: [
    AsyncPipe, SvgIconPipe, TranslatePipe,
    Menu, ListFilter, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonButton, IonMenuButton, IonList, IonPopover, IonIcon, IonItem, IonLabel, IonContent
  ],
  providers: [ResourceStore, OwnershipStore, RESOURCE_EDIT_MODAL_PROVIDER],
  styles: [`
    .clickable { cursor: pointer; user-select: none; }
    /* a locked boat (damage report or «sperren»): its type icon on a red disc */
    ion-icon.locked { background: var(--ion-color-danger); color: var(--ion-color-danger-contrast); border-radius: 50%; padding: 4px; }
  `],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{selectedBoatsCount()}}/{{boatsCount() }} {{ store.i18n.rboat_plural() }}</ion-title>
      @if(hasRole('privileged') || hasRole('resourceAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c_rboat">
            <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c_rboat" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
            <ng-template>
              <ion-content>
                <okr-menu [menuName]="contextMenuName()"/>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>       
      }
    </ion-toolbar>

    <!-- search and filters -->
    <okr-list-filter class="ion-hide-sm-down"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />
    <okr-list-filter class="ion-hide-sm-up"
      (searchTermChanged)="onSearchtermChange($event)"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />
    
    <!-- list header -->
  <ion-toolbar color="primary" class="ion-hide-sm-down">
    <ion-item color="primary" lines="none">
      <ion-label class="clickable" (click)="setSort('name')"><strong>{{ store.i18n.rboat_name() }}{{ sortIcon('name') }}</strong></ion-label>
      <ion-label class="clickable" (click)="setSort('type')"><strong>{{ store.i18n.rboat_type() }}{{ sortIcon('type') }}</strong></ion-label>
      <ion-label class="ion-hide-md-down clickable" (click)="setSort('load')"><strong>{{ store.i18n.load_label() }}{{ sortIcon('load') }}</strong></ion-label>
    </ion-item>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <okr-spinner />
  } @else {
    @if(selectedBoatsCount() === 0) {
      <okr-empty-list [message]="store.i18n.rboat_empty()" />
    } @else {
      <ion-list lines="inset">
        @for(boat of filteredBoats(); track boat.okey) {
          <ion-item class="ion-text-wrap" (click)="showActions(boat)">
            <ion-icon slot="start" src="{{ getCategoryIcon(boat) | svgIcon }}" [class.locked]="ownershipStore.isLocked(boat.okey)" />
            <ion-label>{{ boat.name }}</ion-label>
            <ion-label>{{ typeLabel(boat.subType) | translate | async }}</ion-label>
            <ion-label class="ion-hide-md-down">{{ boat?.load }}</ion-label>
          </ion-item>
        }
      </ion-list>
    }
  }
</ion-content>
  `
})
export class RowingBoatList {
  protected readonly store = inject(ResourceStore);
  protected readonly ownershipStore = inject(OwnershipStore);

  // inputs
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  // sort state (local: the store is shared by all resource lists)
  private sortField = signal<BoatSortField>('name');
  private sortAsc   = signal(true);

  // data
  protected filteredBoats = computed(() => {
    const field = this.sortField();
    const dir   = this.sortAsc() ? 1 : -1;
    return [...(this.store.filteredRboats() ?? [])].sort((a, b) => dir * (
      field === 'type' ? a.subType.localeCompare(b.subType) :
      field === 'load' ? (a.load ?? '').localeCompare(b.load ?? '', undefined, { numeric: true }) :
                         a.name.localeCompare(b.name)
    ));
  });
  protected boatsCount = computed(() => this.store.rboatsCount());
  protected selectedBoatsCount = computed(() => this.filteredBoats().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags('rboat'));
  protected types = computed(() => this.store.appStore.getCategory('rboat_type'));
  protected currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));


  /******************************** getters ******************************************* */
  protected getIcon(resource: ResourceModel): string | undefined {
    return this.store.appStore.getCategoryItem('rboat_type', resource.subType)?.icon;
  }

  /** i18n key of an rboat_type item — data-driven, so it goes through TranslatePipe, not the store. */
  protected typeLabel(subType: string): string {
    const category = this.types();
    return category ? getItemLabel(category, subType) : subType;
  }

  protected sortIcon(field: BoatSortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? ' ↑' : ' ↓';
  }

  /******************************** setters (filter/sort) ******************************************* */
  protected setSort(field: BoatSortField): void {
    this.sortAsc.set(this.sortField() === field ? !this.sortAsc() : true);
    this.sortField.set(field);
  }

  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedSubType(type);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'add':  await this.store.add(false, false); break;
      case 'exportRaw': await this.store.export('raw', 'rboat'); break;
      default: error(undefined, `RowingBoatList.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays the two-level ActionSheet of a rowing boat: the rowing boat itself, its current user (Nutzer/in) and
   * its current ownership (Nutzung). Only the actions the user has permission for are offered.
   * @param boat
   */
  protected async showActions(boat: ResourceModel): Promise<void> {
    const action = await this.ownershipStore.showResourceActions(boat, this.ownershipStore.currentOwnershipOf(boat.okey));
    if (action) this.store.reload();
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected getCategoryIcon(boat: ResourceModel): string {
    return getCategoryIcon(this.types(), boat.subType);
  }
}

