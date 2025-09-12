import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonContent, IonImg, IonItem, IonLabel, IonList, IonThumbnail, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, ResourceModel, UserModel } from '@bk2/shared-models';
import { EmptyListComponent, HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { getAvatarKey } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { ResourceSelectStore } from './resource-select.store';

@Component({
  selector: 'bk-resource-select-modal',
  standalone: true,
  imports: [
    HeaderComponent, SpinnerComponent,
    TranslatePipe, AsyncPipe, AvatarPipe, EmptyListComponent,
    IonContent, IonItem, IonLabel, IonThumbnail, IonImg, IonList,
  ],
  providers: [ResourceSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-thumbnail { width: 30px; height: 30px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <bk-header title="{{ '@resource.operation.select.label' | translate | async }}"
      [isModal]="true" [isSearchable]="true" (searchtermChange)="onSearchChanged($event)" />   
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(selectedResourcesCount() === 0) {
          <bk-empty-list message="@resource.field.empty" />
        } @else {
          @for(resource of filteredResources(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(resource)">
                 <ion-thumbnail slot="start">
                  <ion-img [src]="getAvatarKey(resource) | avatar | async" alt="Avatar Logo" />
                </ion-thumbnail>
                <ion-label>{{resource.name}}</ion-label>
              </ion-item>
            </ion-list>
          }
        }
      }
    </ion-content>
  `
})
export class ResourceSelectModalComponent {
  protected readonly resourceSelectStore = inject(ResourceSelectStore);
  private readonly modalController = inject(ModalController);

  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();

  protected filteredResources = computed(() => this.resourceSelectStore.filteredResources() ?? []);
  protected resources = computed(() => this.resourceSelectStore.resources() ?? []);
  protected selectedResourcesCount = computed(() => this.resources().length);
  protected isLoading = computed(() => this.resourceSelectStore.isLoading());

  protected modelType = ModelType;

  constructor() {
    effect(() => {
      this.resourceSelectStore.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.resourceSelectStore.setCurrentUser(this.currentUser());
    });
  }

  public onSearchChanged(searchTerm: string): void {
    this.resourceSelectStore.setSearchTerm(searchTerm);
  }

  public select(selectedResource: ResourceModel): Promise<boolean> {
    return this.modalController.dismiss(selectedResource, 'confirm');
  }

  // 20.0:key for a rowing boat, 20.4:key for a locker
  protected getAvatarKey(resource: ResourceModel): string {
    return getAvatarKey(ModelType.Resource, resource.bkey, resource.type, resource.subType);
  }
}
