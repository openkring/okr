import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonContent, IonIcon, IonImg, IonItem, IonItemDivider, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { PersonModel, PersonModelName, UserModel } from '@okr/shared-models';
import { FullNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Header, Spinner } from '@okr/shared-ui';

import { AvatarPipe } from '@okr/avatar-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { PersonSelectStore } from './person-select.store';

export type PersonSelectResult =
  | { kind: 'predefined'; person: PersonModel }
  | { kind: 'custom'; label: string };

@Component({
  selector: 'okr-person-select-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    FullNamePipe, AvatarPipe, EmptyList, SvgIconPipe,
    IonContent, IonItem, IonItemDivider, IonLabel, IonAvatar, IonImg, IonList, IonIcon,
  ],
  providers: [PersonSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <okr-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="onSearchTermChange($event)"
      [isSearchable]="true"
      [i18n]="{ title: store.i18n.person_select() }"
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
                <p>{{ store.i18n.person_custom_use() }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        }
        @if(selectedPersonsCount() === 0 && !store.showCustomEntry()) {
          <okr-empty-list [message]="store.i18n.person_empty()" />
        } @else {
          @for(person of memberSection(); track person.okey) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(person)">
                 <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + person.okey | avatar:defaultIcon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{person.firstName | fullName:person.lastName}}</ion-label>
              </ion-item>
            </ion-list>
          }
          @if(store.showOtherDivider()) {
            <!-- the non-member remainder follows — say so, or these names look like members -->
            <ion-item-divider color="light">
              <ion-label>{{ store.i18n.person_beyond_members() }}</ion-label>
            </ion-item-divider>
          }
          @for(person of otherSection(); track person.okey) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(person)">
                 <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + person.okey | avatar:defaultIcon }}" alt="Avatar Logo" />
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
  /** Opt-in two-level lookup (members of the default org first). Off everywhere but trip/logbuch. */
  public membersFirst = input<boolean>(false);

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected memberSection = computed(() => this.store.memberSection() ?? []);
  protected otherSection = computed(() => this.store.otherSection() ?? []);
  protected selectedPersonsCount = computed(() => this.store.matchCount());
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
    effect(() => {
      this.store.setMembersFirst(this.membersFirst());
    });
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  public select(person: PersonModel): Promise<boolean> {
    return dismissOverlay(this.modalController, { kind: 'predefined', person } satisfies PersonSelectResult, 'confirm');
  }

  public selectCustom(): Promise<boolean> {
    return dismissOverlay(this.modalController, { kind: 'custom', label: this.store.customLabel() } satisfies PersonSelectResult, 'confirm');
  }
}
