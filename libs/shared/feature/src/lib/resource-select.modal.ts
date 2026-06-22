import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { ResourceModel, UserModel } from '@bk2/shared-models';
import { EmptyList, Header, Spinner } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { ResourceSelectStore } from './resource-select.store';

@Component({
  selector: 'bk-resource-select-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    Header, Spinner, EmptyList,
    IonContent, IonItem, IonLabel, IonList, IonIcon
  ],
  providers: [ResourceSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-thumbnail { width: 30px; height: 30px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <bk-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="store.setSearchTerm($event)"
      [isSearchable]="true"
      [i18n]="{ title: modalTitle()}"
      [isModal]="true"
    />   
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(selectedResourcesCount() === 0) {
          <bk-empty-list [message]="store.i18n.resource_empty()" />
        } @else {
          @for(resource of filteredResources(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(resource)">
                <ion-icon slot="start" src="{{ getIcon(resource) | svgIcon }}" />
                <ion-label>{{resource.name}}</ion-label>
              </ion-item>
            </ion-list>
          }
        }
      }
    </ion-content>
  `
})
export class ResourceSelectModal {
  protected readonly store = inject(ResourceSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();
  /** Optional, already-resolved title string; falls back to the generic "Resource wählen". */
  public title = input<string>();

  protected searchTerm = linkedSignal(() => this.store.searchTerm());

  // fields
  protected filteredResources = computed(() => this.store.filteredResources() ?? []);
  protected resources = computed(() => this.store.resources() ?? []);
  protected selectedResourcesCount = computed(() => this.resources().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected modalTitle = computed(() => this.title() ?? this.store.i18n.resource_select());

  constructor() {
    effect(() => {
      this.store.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.store.setCurrentUser(this.currentUser());
    });
  }

  public select(selectedResource: ResourceModel): Promise<boolean> {
    return this.modalController.dismiss(selectedResource, 'confirm');
  }

  protected getIcon(resource: ResourceModel): string {
    let iconName: string;
    if (resource.type === 'rboat')
      iconName = this.store.appStore.getCategoryItem('rboat_type', resource.subType)?.icon ?? '';
    else
      iconName = this.store.appStore.getCategoryItem('resource_type', resource.type)?.icon ?? '';
    return iconName ?? '';
  }
}
