import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonContent, IonIcon, IonImg, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { PersonModel, PersonModelName, UserModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, Header, Spinner } from '@bk2/shared-ui';

import { AvatarPipe } from '@bk2/avatar-ui';

import { PersonSelectStore } from './person-select.store';

export type PersonSelectResult =
  | { kind: 'predefined'; person: PersonModel }
  | { kind: 'custom'; label: string };

@Component({
  selector: 'bk-person-select-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    FullNamePipe, AvatarPipe, EmptyList, SvgIconPipe,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList, IonIcon,
  ],
  providers: [PersonSelectStore],
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
      [i18n]="{ title: store.i18n.person_select() }"
      [isModal]="true"
    />
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(store.showCustomEntry()) {
          <ion-list lines="none">
            <ion-item class="item" color="light" (click)="selectCustom()">
              <ion-icon src="{{ 'edit' | svgIcon }}" slot="start" />
              <ion-label>
                <h3>„{{ store.customLabel() }}"</h3>
                <p>{{ store.i18n.person_custom_use() }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        }
        @if(selectedPersonsCount() === 0 && !store.showCustomEntry()) {
          <bk-empty-list [message]="store.i18n.person_empty()" />
        } @else {
          @for(person of filteredPersons(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(person)">
                 <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + person.bkey | avatar:defaultIcon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{person.firstName | fullName:person.lastName}}</ion-label>
              </ion-item>
            </ion-list>
          }
        }
      }
    </ion-content>
  `
})
export class PersonSelectModal {
  protected readonly store = inject(PersonSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();
  public allowCustom = input<boolean>(false);

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected filteredPersons = computed(() => this.store.filteredPersons() ?? []);
  protected selectedPersonsCount = computed(() => this.filteredPersons().length);
  protected isLoading = computed(() => this.store.isLoading());

  protected defaultIcon = this.store.appStore.getCategoryIcon('model_type', PersonModelName);

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

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  public select(person: PersonModel): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'predefined', person } satisfies PersonSelectResult,
      'confirm'
    );
  }

  public selectCustom(): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'custom', label: this.store.customLabel() } satisfies PersonSelectResult,
      'confirm'
    );
  }
}
