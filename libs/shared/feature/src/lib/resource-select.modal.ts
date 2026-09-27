import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { ResourceModel, UserModel } from '@okr/shared-models';
import { EmptyList, Header, Spinner } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { dismissOverlay } from '@okr/shared-util-angular';

import { ResourceSelectStore } from './resource-select.store';

/**
 * A predefined resource is returned as the model itself (callers guard it with isResource), an
 * ad-hoc entry as its label. Only a caller that passes allowCustom can ever see the custom kind.
 */
export type ResourceSelectResult = { kind: 'custom'; label: string };

@Component({
  selector: 'okr-resource-select-modal',
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
    <okr-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="store.setSearchTerm($event)"
      [isSearchable]="true"
      [i18n]="{ title: modalTitle()}"
      [isModal]="true"
    />   
    <ion-content>
      @if(isLoading()) {
        <okr-spinner />
      } @else {
        @if(store.showCustomEntry()) {
          <ion-list lines="none">
            <ion-item class="item" color="light" (click)="selectCustom()">
              <ion-icon src="{{ 'edit' | svgIcon }}" slot="start" />
              <ion-label>
                <h3>„{{ store.customLabel() }}"</h3>
                <p>{{ store.i18n.resource_custom_use() }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        }
        @if(selectedResourcesCount() === 0 && !store.showCustomEntry()) {
          <okr-empty-list [message]="store.i18n.resource_empty()" />
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
  /** Offer the typed term as an ad-hoc entry when it matches no resource (returned as kind: 'custom'). */
  public allowCustom = input<boolean>(false);

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
    effect(() => {
      this.store.setAllowCustom(this.allowCustom());
    });
  }

  public select(selectedResource: ResourceModel): Promise<boolean> {
    return dismissOverlay(this.modalController, selectedResource, 'confirm');
  }

  public selectCustom(): Promise<boolean> {
    return dismissOverlay(this.modalController, { kind: 'custom', label: this.store.customLabel() } satisfies ResourceSelectResult, 'confirm');
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
