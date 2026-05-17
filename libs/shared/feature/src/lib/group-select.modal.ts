import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonList, ModalController } from '@ionic/angular/standalone';

import { GroupModel, GroupModelName, UserModel } from '@bk2/shared-models';
import { EmptyList, Header, Spinner } from '@bk2/shared-ui';

import { MultiAvatar } from '@bk2/cms-menu-ui';

import { GroupSelectStore } from './group-select.store';

@Component({
  selector: 'bk-group-select-modal',
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
    <bk-header
      [(searchTerm)]="searchTerm"
      [isSearchable]="true"
      title="@subject.group.operation.select.label"
      [isModal]="true"
    />   
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(selectedGroupsCount() === 0) {
          <bk-empty-list message="@subject.group.field.empty" />
        } @else {
          <ion-list lines="inset">
            @for(group of filteredGroups(); track $index) {
              <bk-multi-avatar [icon]="group.icon" [label]="group.name"  (click)="select(group)"/>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class GroupSelectModal {
  protected readonly groupSelectStore = inject(GroupSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();

  protected searchTerm = linkedSignal(() => this.groupSelectStore.searchTerm());

  // fields
  protected filteredGroups = computed(() => this.groupSelectStore.filteredGroups() ?? []);
  protected groups = computed(() => this.groupSelectStore.groups() ?? []);
  protected selectedGroupsCount = computed(() => this.filteredGroups().length);
  protected isLoading = computed(() => this.groupSelectStore.isLoading());

  protected defaultIcon = this.groupSelectStore.appStore.getCategoryIcon('model_type', GroupModelName);

  constructor() {
    effect(() => {
      this.groupSelectStore.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.groupSelectStore.setCurrentUser(this.currentUser());
    });
    effect(() => {
      this.groupSelectStore.setSearchTerm(this.searchTerm());
    });
  }

  public select(selectedGroup: GroupModel): Promise<boolean> {
    return this.modalController.dismiss(selectedGroup, 'confirm');
  }
}
