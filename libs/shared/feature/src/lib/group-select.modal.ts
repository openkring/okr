import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonContent, IonImg, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { GroupModel, GroupModelName, UserModel } from '@bk2/shared-models';
import { EmptyListComponent, HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { AvatarPipe } from '@bk2/avatar-ui';
import { GroupSelectStore } from './group-select.store';

@Component({
  selector: 'bk-group-select-modal',
  standalone: true,
  imports: [
    HeaderComponent, SpinnerComponent,
    AsyncPipe, AvatarPipe, EmptyListComponent,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList,
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
          @for(group of groups(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(group)">
                 <ion-avatar slot="start">
                  <ion-img src="{{ 'group.' + group.bkey | avatar:defaultIcon | async }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ group.name }}</ion-label>
              </ion-item>
            </ion-list>
          }
        }
      }
    </ion-content>
  `
})
export class GroupSelectModalComponent {
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
  }

  public select(selectedGroup: GroupModel): Promise<boolean> {
    return this.modalController.dismiss(selectedGroup, 'confirm');
  }
}
