import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonList, ModalController } from '@ionic/angular/standalone';

import { GroupModel, GroupModelName, UserModel } from '@okr/shared-models';
import { EmptyList, Header, Spinner } from '@okr/shared-ui';

import { MultiAvatar } from '@okr/cms-menu-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { GroupSelectStore } from './group-select.store';

@Component({
  selector: 'okr-group-select-modal',
  standalone: true,
  imports: [
    Header, Spinner, EmptyList, MultiAvatar,
    IonContent, IonList,
  ],
  providers: [GroupSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <okr-header
      [(searchTerm)]="searchTerm"
      [isSearchable]="true"
      [i18n]="{ title: store.i18n.group_select() }"
      [isModal]="true"
    />   
    <ion-content>
      @if(isLoading()) {
        <okr-spinner />
      } @else {
        @if(selectedGroupsCount() === 0) {
          <okr-empty-list [message]="store.i18n.group_empty()" />
        } @else {
          <ion-list lines="inset">
            @for(group of filteredGroups(); track $index) {
              <okr-multi-avatar [icon]="group.icon" [label]="group.name"  (click)="select(group)"/>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class GroupSelectModal {
  protected readonly store = inject(GroupSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();

  protected searchTerm = linkedSignal(() => this.store.searchTerm());

  // fields
  protected filteredGroups = computed(() => this.store.filteredGroups() ?? []);
  protected groups = computed(() => this.store.groups() ?? []);
  protected selectedGroupsCount = computed(() => this.filteredGroups().length);
  protected isLoading = computed(() => this.store.isLoading());

  protected defaultIcon = this.store.appStore.getCategoryIcon('model_type', GroupModelName);

  constructor() {
    effect(() => {
      this.store.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.store.setCurrentUser(this.currentUser());
    });
    effect(() => {
      this.store.setSearchTerm(this.searchTerm());
    });
  }

  public select(selectedGroup: GroupModel): Promise<boolean> {
    return dismissOverlay(this.modalController, selectedGroup, 'confirm');
  }
}
