import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonContent, IonImg, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { PersonModel, PersonModelName, UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { EmptyList, Header, Spinner } from '@bk2/shared-ui';

import { AvatarPipe } from '@bk2/avatar-ui';

import { PersonSelectStore } from './person-select.store';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-person-select-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    FullNamePipe, AvatarPipe, EmptyList, TranslatePipe, AsyncPipe,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList,
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
      [i18n]="{ title: ('@select_person' | translate | async)  ?? 'select'}"
      [isModal]="true"
    />   
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(selectedPersonsCount() === 0) {
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
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  public select(selectedPerson: PersonModel): Promise<boolean> {
    return this.modalController.dismiss(selectedPerson, 'confirm');
  }
}
