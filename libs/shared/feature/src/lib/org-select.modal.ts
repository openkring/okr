import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAvatar, IonContent, IonImg, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, OrgModel, UserModel } from '@bk2/shared-models';
import { EmptyListComponent, HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { AvatarPipe } from '@bk2/avatar-ui';
import { OrgSelectStore } from './org-select.store';

@Component({
  selector: 'bk-org-select-modal',
  standalone: true,
  imports: [
    HeaderComponent, SpinnerComponent,
    TranslatePipe, AsyncPipe, AvatarPipe, EmptyListComponent,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList,
  ],
  providers: [OrgSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <bk-header title="{{ '@subject.org.operation.select.label' | translate | async }}"
      [isModal]="true" [isSearchable]="true" (searchtermChange)="onSearchChanged($event)" />   
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(selectedOrgsCount() === 0) {
          <bk-empty-list message="@subject.org.field.empty" />
        } @else {
          @for(org of orgs(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(org)">
                 <ion-avatar slot="start">
                  <ion-img src="{{ modelType.Org + '.' + org.bkey | avatar | async }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ org.name }}</ion-label>
              </ion-item>
            </ion-list>
          }
        }
      }
    </ion-content>
  `
})
export class OrgSelectModalComponent {
  protected readonly orgSelectStore = inject(OrgSelectStore);
  private readonly modalController = inject(ModalController);

  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();

  protected filteredOrgs = computed(() => this.orgSelectStore.filteredOrgs() ?? []);
  protected orgs = computed(() => this.orgSelectStore.orgs() ?? []);
  protected selectedOrgsCount = computed(() => this.filteredOrgs().length);
  protected isLoading = computed(() => this.orgSelectStore.isLoading());

  protected modelType = ModelType;

  constructor() {
    effect(() => {
      this.orgSelectStore.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.orgSelectStore.setCurrentUser(this.currentUser());
    });
  }

  public onSearchChanged(searchTerm: string): void {
    this.orgSelectStore.setSearchTerm(searchTerm);
  }

  public select(selectedOrg: OrgModel): Promise<boolean> {
    return this.modalController.dismiss(selectedOrg, 'confirm');
  }
}
