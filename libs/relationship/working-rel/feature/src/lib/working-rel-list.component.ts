import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonTitle, IonToolbar, IonItemSliding, IonItemOptions, IonItemOption, IonImg, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonPopover } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, FullNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { hasRole, isOngoing } from '@bk2/shared/util-core';
import { error } from '@bk2/shared/util-angular';
import { ModelType, WorkingRelModel, RoleName } from '@bk2/shared/models';
import { addAllCategory, WorkingRelStates, WorkingRelTypes } from '@bk2/shared/categories';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { WorkingRelListStore } from './working-rel-list.store';
import { WorkingRelNamePipe } from '@bk2/working-rel/util';

@Component({
    selector: 'bk-working-rel-list',
    imports: [
      TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe, WorkingRelNamePipe,
      ListFilterComponent, EmptyListComponent, SpinnerComponent, MenuComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
      IonLabel, IonContent, IonItem, IonItemOptions, IonItemOption, IonImg, IonList,
      IonGrid, IonRow, IonCol, IonAvatar, IonPopover
    ],
    providers: [WorkingRelListStore],
    template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedWorkingRelsCount()}}/{{workingRelsCount()}} {{ '@workingRel.list.title' | translate | async }}</ion-title>
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
      [tags]="workingRelTags()"
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
      @if(selectedWorkingRelsCount() === 0) {
        <bk-empty-list message="@workingRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(workingRel of filteredWorkingRels(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-grid (click)="edit(undefined, workingRel)">
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
              @if(hasRole('resourceAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="delete(slidingItem, workingRel)">
                    <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                  </ion-item-option>
                  @if(isOngoing(workingRel)) {
                    <ion-item-option color="warning" (click)="end(slidingItem, workingRel)">
                      <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                    </ion-item-option>
                  }
                  <ion-item-option color="primary" (click)="edit(slidingItem, workingRel)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
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
export class WorkingRelListComponent {
  protected workingRelListStore = inject(WorkingRelListStore);
  
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredWorkingRels = computed(() => this.workingRelListStore.filteredWorkingRels());
  protected allWorkingRels = computed(() => this.workingRelListStore.allWorkingRels());
  protected workingRelsCount = computed(() => this.workingRelListStore.allWorkingRels()?.length ?? 0);
  protected selectedWorkingRelsCount = computed(() => this.filteredWorkingRels()?.length ?? 0);
  protected isLoading = computed(() => this.workingRelListStore.isLoading());
  protected workingRelTags = computed(() => this.workingRelListStore.getTags());

  protected modelType = ModelType;
  protected readonly allWorkingRelTypes = addAllCategory(WorkingRelTypes);
  protected readonly allWorkingRelStates = addAllCategory(WorkingRelStates);

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.workingRelListStore.add(); break;
      case 'exportRaw': await this.workingRelListStore.export('raw'); break;
      default: error(undefined, `WorkingRelListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async delete(slidingItem?: IonItemSliding, workingRel?: WorkingRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.workingRelListStore.delete(workingRel);
  }

  public async end(slidingItem?: IonItemSliding, workingRel?: WorkingRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.workingRelListStore.end(workingRel);
  }

  public async edit(slidingItem?: IonItemSliding, workingRel?: WorkingRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.workingRelListStore.edit(workingRel);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.workingRelListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.workingRelListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(workingRelType: number): void {
    this.workingRelListStore.setSelectedType(workingRelType);
  }

  protected onStateSelected(workingRelState: number): void {
    this.workingRelListStore.setSelectedState(workingRelState);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.workingRelListStore.currentUser());
  }

  protected isOngoing(workingRel: WorkingRelModel): boolean {
    return isOngoing(workingRel.validTo);
  }  
}
