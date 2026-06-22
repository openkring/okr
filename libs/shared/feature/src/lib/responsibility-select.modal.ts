import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { ResponsibilityModel, UserModel } from '@bk2/shared-models';
import { EmptyList, Header, Spinner } from '@bk2/shared-ui';

import { ResponsibilitySelectStore } from './responsibility-select.store';

@Component({
  selector: 'bk-responsibility-select-modal',
  standalone: true,
  imports: [
    Header, Spinner, EmptyList,
    IonContent, IonItem, IonLabel, IonList,
  ],
  providers: [ResponsibilitySelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <bk-header
      [(searchTerm)]="searchTerm"
      [isSearchable]="true"
      [i18n]="{ title: store.i18n.responsibility_select()}"
      [isModal]="true"
    />
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(count() === 0) {
          <bk-empty-list [message]="store.i18n.responsibility_empty()" />
        } @else {
          <ion-list lines="none">
            @for(responsibility of filteredResponsibilities(); track responsibility.bkey) {
              <ion-item class="item" (click)="select(responsibility)">
                <ion-label>{{ responsibility.name }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class ResponsibilitySelectModal {
  protected readonly store = inject(ResponsibilitySelectStore);
  private readonly modalController = inject(ModalController);

  public currentUser = input.required<UserModel>();

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected filteredResponsibilities = computed(() => this.store.filteredResponsibilities() ?? []);
  protected count = computed(() => this.filteredResponsibilities().length);
  protected isLoading = computed(() => this.store.isLoading());

  constructor() {
    effect(() => this.store.setCurrentUser(this.currentUser()));
    effect(() => this.store.setSearchTerm(this.searchTerm()));
  }

  public select(responsibility: ResponsibilityModel): Promise<boolean> {
    return this.modalController.dismiss(responsibility, 'confirm');
  }
}
