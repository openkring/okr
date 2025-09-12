import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, ModelType, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { MenuComponent } from '@bk2/cms-menu-feature';

import { GroupListStore } from './group-list.store';

@Component({
  selector: 'bk-group-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe,
    SpinnerComponent, EmptyListComponent,
    MenuComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonPopover,
    IonItemOptions, IonItemOption, IonAvatar, IonImg, IonList
  ],
  providers: [GroupListStore],
  template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedGroupsCount()}}/{{groupsCount()}} {{ '@subject.group.plural' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="c-groups">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="c-groups" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="groupTags()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
    />

      <!-- list header -->
      <ion-toolbar color="primary">
        <ion-grid>
          <ion-row>
            <ion-col>
              <ion-label><strong>{{ '@subject.list.header.name' | translate | async }}</strong></ion-label>
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
      @if(selectedGroupsCount() === 0) {
        <bk-empty-list message="@subject.group.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(group of filteredGroups(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-item (click)="view(slidingItem, group)">
                <ion-avatar slot="start">
                  <ion-img src="{{ modelType.Group + '.' + group.bkey | avatar | async }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{group.name}}</ion-label>      
              </ion-item>
              @if(hasRole('memberAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="primary" (click)="edit(slidingItem, group)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="danger" (click)="delete(slidingItem, group)">
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
export class GroupListComponent {
  protected readonly groupListStore = inject(GroupListStore);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredGroups = computed(() => this.groupListStore.filteredGroups() ?? []);
  protected groupsCount = computed(() => this.groupListStore.groups()?.length ?? 0);
  protected selectedGroupsCount = computed(() => this.filteredGroups().length);
  protected isLoading = computed(() => this.groupListStore.isLoading());
  protected groupTags = computed(() => this.groupListStore.getTags());

  protected modelType = ModelType;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.groupListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.groupListStore.setSelectedTag($event);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    console.log('GroupListComponent.onPopoverDismiss', $event);
    const _selectedMethod = $event.detail.data;
    switch (_selectedMethod) {
      case 'add': await this.groupListStore.add(); break;
      case 'exportRaw': await this.groupListStore.export("raw_groups"); break;
      default: error(undefined, `GroupListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async edit(slidingItem?: IonItemSliding, group?: GroupModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.groupListStore.edit(group);
  }

  public async view(slidingItem?: IonItemSliding, group?: GroupModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.groupListStore.view(group);
  }

  public async delete(slidingItem?: IonItemSliding, group?: GroupModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.groupListStore.delete(group);
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.groupListStore.currentUser());
  }
}
