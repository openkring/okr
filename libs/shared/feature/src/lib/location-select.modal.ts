import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonContent, IonIcon, IonImg, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { EmptyList, Header, Spinner } from '@bk2/shared-ui';
import { LocationModel, LocationModelName, UserModel } from '@bk2/shared-models';

import { AvatarPipe } from '@bk2/avatar-ui';

import { LocationSelectStore } from './location-select.store';

export type LocationSelectResult =
  | { kind: 'predefined'; location: LocationModel }
  | { kind: 'custom'; label: string };

@Component({
  selector: 'bk-location-select-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    AvatarPipe, EmptyList,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList, IonIcon,
  ],
  providers: [LocationSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <bk-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="onSearchTermChange($event)"
      [isSearchable]="true"
      [i18n]="{ title: store.i18n.location_select() }"
      [isModal]="true"
    />
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(store.showCustomEntry()) {
          <ion-list lines="none">
            <ion-item class="item" color="light" (click)="selectCustom()">
              <ion-icon name="create-outline" slot="start" />
              <ion-label>
                <p>{{ store.i18n.location_custom_use() }}</p>
                <h3>„{{ store.customLabel() }}"</h3>
              </ion-label>
            </ion-item>
          </ion-list>
        }
        @if(selectedLocationsCount() === 0 && !store.showCustomEntry()) {
          <bk-empty-list [message]="store.i18n.location_empty()" />
        } @else {
          @for(location of filteredLocations(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(location)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'location.' + location.bkey | avatar:defaultIcon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{location.name}}</ion-label>
              </ion-item>
            </ion-list>
          }
        }
      }
    </ion-content>
  `
})
export class LocationSelectModal {
  protected readonly store = inject(LocationSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public type = input.required<string>();
  public currentUser = input.required<UserModel>();
  public allowCustom = input<boolean>(false);

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected filteredLocations = computed(() => this.store.filteredLocations() ?? []);
  protected selectedLocationsCount = computed(() => this.filteredLocations().length);
  protected isLoading = computed(() => this.store.isLoading());

  protected defaultIcon = this.store.appStore.getCategoryIcon('model_type', LocationModelName);

  constructor() {
    effect(() => this.store.setType(this.type()));
    effect(() => this.store.setCurrentUser(this.currentUser()));
    effect(() => this.store.setAllowCustom(this.allowCustom()));
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  public select(location: LocationModel): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'predefined', location } satisfies LocationSelectResult,
      'confirm'
    );
  }

  public selectCustom(): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'custom', label: this.store.customLabel() } satisfies LocationSelectResult,
      'confirm'
    );
  }
}
