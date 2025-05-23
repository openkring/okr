import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar, IonItemSliding, IonItemOptions, IonItemOption, IonAvatar, IonImg, IonList, IonPopover } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { error, TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, FullNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared/ui';
import { AllCategories, ModelType, PersonModel } from '@bk2/shared/models';
import { addAllCategory, GenderTypes } from '@bk2/shared/categories';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';

import { MenuComponent } from '@bk2/cms/menu/feature';

import { PersonListStore } from './person-list.store';

@Component({
  selector: 'bk-person-list',
  imports: [
    TranslatePipe, FullNamePipe, AsyncPipe, AvatarPipe, SvgIconPipe,
    SpinnerComponent, EmptyListComponent, ListFilterComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonItemSliding,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonPopover,
    IonItemOptions, IonItemOption, IonAvatar, IonImg, IonList
  ],
  providers: [PersonListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ selectedPersonsCount()}}/{{personsCount()}} {{ '@subject.person.plural' | translate | async }}</ion-title>
      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-buttons slot="end">
          <ion-button id="c-persons">
            <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="c-persons" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
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
      [tags]="personTags()"
      [types]="genders"
      typeName="gender"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)"
      (typeChanged)="onGenderSelected($event)"
    />

    <!-- list header -->
    <ion-toolbar color="primary" class="ion-hide-sm-down">
      <ion-grid>
        <ion-row>
          <ion-col size="5">
            <ion-label><strong>{{ '@subject.list.header.name' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="3">
            <ion-label><strong>{{ '@subject.list.header.phone' | translate | async }}</strong></ion-label>
          </ion-col>
          <ion-col size="4">
            <ion-label><strong>{{ '@subject.list.header.email' | translate | async }}</strong></ion-label>
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
      @if(selectedPersonsCount() === 0) {
        <bk-empty-list message="@subject.person.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(person of filteredPersons(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-item>
                <ion-avatar slot="start" (click)="edit(person, slidingItem)">
                  <ion-img src="{{ modelType.Person + '.' + person.bkey | avatar | async }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label (click)="edit(person, slidingItem)">{{person.firstName | fullName:person.lastName}}</ion-label>      
                <ion-label class="ion-hide-sm-down">
                  @if(person.fav_phone) {
                    <a href="tel:{{person.fav_phone}}" style="text-decoration:none;">
                      <span>{{person.fav_phone }}</span>
                    </a>
                  }
                </ion-label>
                <ion-label class="ion-hide-sm-down">
                  @if(person?.fav_email) {
                    <a href="mailto:{{person.fav_email}}" style="text-decoration:none;">
                      <span>{{person.fav_email }}</span>
                    </a>
                  }
                </ion-label> 
                <ion-buttons slot="end" class="ion-hide-sm-up">
                  <ion-button>
                    <ion-icon src="{{'tel' | svgIcon }}" slot="start" color="primary" />
                  </ion-button>
                  <ion-button>
                  <ion-icon src="{{'email' | svgIcon }}" slot="icon-only" color="primary"/>
                  </ion-button>
                </ion-buttons>
              </ion-item>
              @if(hasRole('memberAdmin')) {
                <ion-item-options side="end">
                <ion-item-option color="primary" (click)="edit(person, slidingItem)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                  <ion-item-option color="danger" (click)="delete(person, slidingItem)">
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
export class PersonListComponent {
  protected readonly personListStore = inject(PersonListStore);
  
  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredPersons = computed(() => this.personListStore.filteredPersons() ?? []);
  protected personsCount = computed(() => this.personListStore.personsCount());
  protected selectedPersonsCount = computed(() => this.filteredPersons().length);
  protected isLoading = computed(() => this.personListStore.isLoading());
  protected readonly personTags = computed(() => this.personListStore.getTags());

  protected selectedCategory = AllCategories;
  protected genders = addAllCategory(GenderTypes);
  protected readonly modelType = ModelType;

  /******************************** setters (filter) ******************************************* */
  protected onSearchtermChange(searchTerm: string): void {
    this.personListStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.personListStore.setSelectedTag($event);
  }

  protected onGenderSelected($event: number): void {
    this.personListStore.setSelectedGender($event);
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const _selectedMethod = $event.detail.data;
    switch(_selectedMethod) {
      case 'add':  await this.personListStore.add(); break;
      case 'exportRaw': await this.personListStore.export('raw'); break;
      case 'copyEmailAddresses': await this.personListStore.copyEmailAddresses(); break;
      default: error(undefined, `PersonListComponent.call: unknown method ${_selectedMethod}`);
    }
  }
  
  public async edit(person: PersonModel, slidingItem?: IonItemSliding, ): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.personListStore.edit(person);
  }

  public async delete(person: PersonModel, slidingItem?: IonItemSliding): Promise<void> {
    if (slidingItem) slidingItem.close();
    await this.personListStore.delete(person);
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.personListStore.currentUser());
  }
}

