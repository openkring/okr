import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { ResourceModel, UserModel } from '@bk2/shared-models';
import { EmptyListComponent, HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { ResourceSelectStore } from './resource-select.store';
import { SvgIconPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-resource-select-modal',
  standalone: true,
  imports: [
    SvgIconPipe,
    HeaderComponent, SpinnerComponent, EmptyListComponent,
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
      (searchTermChange)="resourceSelectStore.setSearchTerm($event)"
      [isSearchable]="true"
      title="@resource.operation.select.label"
      [isModal]="true"
    />   
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
export class ResourceSelectModalComponent {
  protected readonly resourceSelectStore = inject(ResourceSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();

  protected searchTerm = linkedSignal(() => this.resourceSelectStore.searchTerm());

  // fields
  protected filteredResources = computed(() => this.resourceSelectStore.filteredResources() ?? []);
  protected resources = computed(() => this.resourceSelectStore.resources() ?? []);
  protected selectedResourcesCount = computed(() => this.resources().length);
  protected isLoading = computed(() => this.resourceSelectStore.isLoading());

  constructor() {
    effect(() => {
      this.resourceSelectStore.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.resourceSelectStore.setCurrentUser(this.currentUser());
    });
  }

  public select(selectedResource: ResourceModel): Promise<boolean> {
    return this.modalController.dismiss(selectedResource, 'confirm');
  }

  protected getIcon(resource: ResourceModel): string {
    let iconName: string;
    if (resource.type === 'rboat')
      iconName = this.resourceSelectStore.appStore.getCategoryItem('rboat_type', resource.subType)?.icon ?? '';
    else
      iconName = this.resourceSelectStore.appStore.getCategoryItem('resource_type', resource.type)?.icon ?? '';
    console.log(`ResourceSelectModal(${resource.type}, ${resource.subType}) -> ${iconName}`);
    return iconName ?? '';
  }
}
