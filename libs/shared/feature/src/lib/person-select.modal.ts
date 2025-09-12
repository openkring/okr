import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAvatar, IonContent, IonImg, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, PersonModel, UserModel } from '@bk2/shared-models';
import { FullNamePipe } from '@bk2/shared-pipes';
import { EmptyListComponent, HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { AvatarPipe } from '@bk2/avatar-ui';
import { PersonSelectStore } from './person-select.store';

@Component({
  selector: 'bk-person-select-modal',
  standalone: true,
  imports: [
    HeaderComponent, SpinnerComponent,
    TranslatePipe, AsyncPipe, FullNamePipe, AvatarPipe, EmptyListComponent,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList,
  ],
  providers: [PersonSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <bk-header title="{{ '@subject.person.operation.select.label' | translate | async }}"
    [isModal]="true" [isSearchable]="true" (searchtermChange)="onSearchChanged($event)" />   
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(selectedPersonsCount() === 0) {
          <bk-empty-list message="@subject.person.field.empty" />
        } @else {
          @for(person of filteredPersons(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(person)">
                 <ion-avatar slot="start">
                  <ion-img src="{{ modelType.Person + '.' + person.bkey | avatar | async }}" alt="Avatar Logo" />
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
export class PersonSelectModalComponent {
  protected readonly personSelectStore = inject(PersonSelectStore);
  private readonly modalController = inject(ModalController);

  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();

  protected filteredPersons = computed(() => this.personSelectStore.filteredPersons() ?? []);
  protected selectedPersonsCount = computed(() => this.filteredPersons().length);
  protected isLoading = computed(() => this.personSelectStore.isLoading());

  protected modelType = ModelType;

  constructor() {
    effect(() => {
      this.personSelectStore.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.personSelectStore.setCurrentUser(this.currentUser());
    });
  }

  public onSearchChanged(searchTerm: string): void {
    this.personSelectStore.setSearchTerm(searchTerm);
  }

  public select(selectedPerson: PersonModel): Promise<boolean> {
    return this.modalController.dismiss(selectedPerson, 'confirm');
  }
}
