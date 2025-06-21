import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonTitle, IonToolbar, IonItemSliding, IonItemOptions, IonItemOption, IonImg, IonList, IonGrid, IonRow, IonCol, IonAvatar, IonPopover } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, FullNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { RoleName } from '@bk2/shared/config';
import { error, hasRole, isOngoing } from '@bk2/shared/util';
import { ModelType, PersonalRelModel } from '@bk2/shared/models';
import { addAllCategory, PersonalRelTypes } from '@bk2/shared/categories';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { PersonalRelNamePipe } from '@bk2/personal-rel/util';
import { PersonalRelListStore } from './personal-rel-list.store';

@Component({
    selector: 'bk-personal-rel-list',
    imports: [
      TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe, PersonalRelNamePipe,
      ListFilterComponent, EmptyListComponent, SpinnerComponent,
      MenuComponent,
      IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
      IonLabel, IonContent, IonItem, IonItemOptions, IonItemOption, IonImg, IonList,
      IonGrid, IonRow, IonCol, IonAvatar, IonPopover
    ],
    providers: [PersonalRelListStore],
    template: `
    <ion-header>
      <!-- title and actions -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ selectedPersonalRelsCount()}}/{{personalRelsCount()}} {{ '@personalRel.list.title' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="c-prel">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="c-prel" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="personalRelTags()"
      [types]="personalRelTypes"
      typeName="personalRelType"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onTypeSelected($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-item lines="none" color="primary">
        <ion-label><strong>{{'@personalRel.list.header.person1' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@personalRel.list.header.type' | translate | async}}</strong></ion-label>
        <ion-label><strong>{{'@personalRel.list.header.person2' | translate | async}}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading() === true) {
      <bk-spinner />
    } @else {
      @if(selectedPersonalRelsCount() === 0) {
        <bk-empty-list message="@personalRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(personalRel of filteredPersonalRels(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-grid (click)="edit(undefined, personalRel)">
                <ion-row>
                  <ion-col size="4">
                    <ion-item lines="none">
                      <ion-avatar slot="start">
                        <ion-img src="{{ modelType.Person + '.' + personalRel.subjectKey | avatar | async}}" alt="avatar of first person" />
                      </ion-avatar>
                      <ion-label>{{personalRel.subjectFirstName | fullName:personalRel.subjectLastName}}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="4">
                    <ion-item lines="none">
                      <ion-label>{{ personalRel.type | personalRelName:personalRel.label }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="4">
                    <ion-item lines="none">
                      <ion-avatar slot="start">
                        <ion-img src="{{ modelType.Person + '.' + personalRel.objectKey | avatar | async}}" alt="avatar of second person" />
                      </ion-avatar>
                      <ion-label>{{personalRel.objectFirstName | fullName:personalRel.objectLastName}}</ion-label>
                    </ion-item> 
                  </ion-col>
                </ion-row>
              </ion-grid>
              @if(hasRole('resourceAdmin')) {
                <ion-item-options side="end">
                  <ion-item-option color="danger" (click)="delete(slidingItem, personalRel)">
                    <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                  </ion-item-option>
                  @if(isOngoing(personalRel)) {
                    <ion-item-option color="warning" (click)="end(slidingItem, personalRel)">
                      <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                    </ion-item-option>
                  }
                  <ion-item-option color="primary" (click)="edit(slidingItem, personalRel)">
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
export class PersonalRelListComponent {
  protected personalRelListStore = inject(PersonalRelListStore);
  
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredPersonalRels = computed(() => this.personalRelListStore.filteredPersonalRels());
  protected allPersonalRels = computed(() => this.personalRelListStore.allPersonalRels());
  protected personalRelsCount = computed(() => this.personalRelListStore.allPersonalRels()?.length ?? 0);
  protected selectedPersonalRelsCount = computed(() => this.filteredPersonalRels()?.length ?? 0);
  protected isLoading = computed(() => this.personalRelListStore.isLoading());
  protected personalRelTags = computed(() => this.personalRelListStore.getTags());

  protected modelType = ModelType;
  protected readonly personalRelTypes = addAllCategory(PersonalRelTypes);

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.personalRelListStore.add(); break;
      case 'exportRaw': await this.personalRelListStore.export("raw"); break;
      default: error(undefined, `PersonalRelListComponent.call: unknown method ${_selectedMethod}`);
    }
  }

  public async delete(slidingItem?: IonItemSliding, personalRel?: PersonalRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.personalRelListStore.delete(personalRel);
  }

  public async end(slidingItem?: IonItemSliding, personalRel?: PersonalRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.personalRelListStore.end(personalRel);
  }

  public async edit(slidingItem?: IonItemSliding, personalRel?: PersonalRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.personalRelListStore.edit(personalRel);
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.personalRelListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.personalRelListStore.setSelectedTag(tag);
  }

  protected onTypeSelected(personalRelType: number): void {
    this.personalRelListStore.setSelectedPersonalRelType(personalRelType);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.personalRelListStore.currentUser());
  }

  protected isOngoing(personalRel: PersonalRelModel): boolean {
    return isOngoing(personalRel.validTo);
  }  
}
