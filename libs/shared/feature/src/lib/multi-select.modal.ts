import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar, IonContent, IonImg, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, ModalController } from '@ionic/angular/standalone';

import { GroupModelName, OrgModel, OrgModelName, PersonModel, PersonModelName, UserModel } from '@okr/shared-models';
import { FullNamePipe } from '@okr/shared-pipes';

import { EmptyList, Header, Spinner } from '@okr/shared-ui';
import { AvatarPipe } from '@okr/avatar-ui';

import { GroupSelectStore } from './group-select.store';
import { OrgSelectStore } from './org-select.store';
import { PersonSelectStore } from './person-select.store';
import { TranslatePipe } from '@okr/shared-i18n';
import { dismissOverlay } from '@okr/shared-util-angular';
import { AsyncPipe } from '@angular/common';

export type MultiSelectSegment = 'org' | 'group' | 'person';

@Component({
  selector: 'okr-multi-select-modal',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe, AsyncPipe,
    Header, Spinner, FullNamePipe, AvatarPipe, EmptyList,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList,
    IonSegment, IonSegmentButton,
  ],
  providers: [OrgSelectStore, GroupSelectStore, PersonSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    ion-list { padding: 0px; }
    ion-segment { margin: 8px 0; }
  `],
  template: `
    <okr-header
      [(searchTerm)]="searchTerm"
      [isSearchable]="true"
      [i18n]="{ title: ('@sselect.label' | translate | async) ?? 'select' }"
      [isModal]="true"
    />
    <ion-content>
      @if(segments().length > 1) {
        <ion-segment [(ngModel)]="activeSegment">
          @for(segment of segments(); track segment) {
            <ion-segment-button [value]="segment">
              <ion-label>{{ ('@select.' + segment) | translate | async  }}</ion-label>
            </ion-segment-button>
          }
        </ion-segment>
      }

      @if(activeSegment() === 'org') {
        @if(orgIsLoading()) {
          <okr-spinner />
        } @else if(filteredOrgs().length === 0) {
          <okr-empty-list [message]="orgSelectStore.i18n.org_empty()" />
        } @else {
          <ion-list lines="none">
            @for(org of filteredOrgs(); track $index) {
              <ion-item class="item" (click)="select('org', org.okey)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'org.' + org.okey | avatar:orgDefaultIcon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ org.name }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }

      @if(activeSegment() === 'group') {
        @if(groupIsLoading()) {
          <okr-spinner />
        } @else if(filteredGroups().length === 0) {
          <okr-empty-list [message]="groupSelectStore.i18n.group_empty()" />
        } @else {
          <ion-list lines="none">
            @for(group of filteredGroups(); track $index) {
              <ion-item class="item" (click)="select('group', group.okey)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'group.' + group.okey | avatar:group.icon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ group.name }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }

      @if(activeSegment() === 'person') {
        @if(personIsLoading()) {
          <okr-spinner />
        } @else if(filteredPersons().length === 0) {
          <okr-empty-list [message]="personSelectStore.i18n.person_empty()" />
        } @else {
          <ion-list lines="none">
            @for(person of filteredPersons(); track $index) {
              <ion-item class="item" (click)="select('person', person.okey)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + person.okey | avatar:personDefaultIcon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ person.firstName | fullName:person.lastName }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class MultiSelectModal {
  protected readonly orgSelectStore = inject(OrgSelectStore);
  protected readonly groupSelectStore = inject(GroupSelectStore);
  protected readonly personSelectStore = inject(PersonSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public contents = input.required<string>();
  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();

  protected segments = computed<MultiSelectSegment[]>(() =>
    this.contents()
      .split(',')
      .map(s => s.trim() as MultiSelectSegment)
      .filter(s => ['org', 'group', 'person'].includes(s))
  );

  protected activeSegment = linkedSignal<MultiSelectSegment>(() => this.segments()[0] ?? 'org');
  protected searchTerm = linkedSignal(() => this.orgSelectStore.searchTerm());

  // org
  protected filteredOrgs = computed(() => this.orgSelectStore.filteredOrgs() ?? []);
  protected orgIsLoading = computed(() => this.orgSelectStore.isLoading());
  protected orgDefaultIcon = this.orgSelectStore.appStore.getCategoryIcon('model_type', OrgModelName);

  // group
  protected filteredGroups = computed(() => this.groupSelectStore.filteredGroups() ?? []);
  protected groupIsLoading = computed(() => this.groupSelectStore.isLoading());
  protected groupDefaultIcon = this.groupSelectStore.appStore.getCategoryIcon('model_type', GroupModelName);

  // person
  // membersFirst stays off here, so otherSection is simply every matching person.
  protected filteredPersons = computed(() => this.personSelectStore.otherSection() ?? []);
  protected personIsLoading = computed(() => this.personSelectStore.isLoading());
  protected personDefaultIcon = this.personSelectStore.appStore.getCategoryIcon('model_type', PersonModelName);

  constructor() {
    effect(() => {
      const tag = this.selectedTag();
      this.orgSelectStore.setSelectedTag(tag);
      this.groupSelectStore.setSelectedTag(tag);
      this.personSelectStore.setSelectedTag(tag);
    });
    effect(() => {
      const user = this.currentUser();
      this.orgSelectStore.setCurrentUser(user);
      this.groupSelectStore.setCurrentUser(user);
      this.personSelectStore.setCurrentUser(user);
    });
    effect(() => {
      const term = this.searchTerm();
      this.orgSelectStore.setSearchTerm(term);
      this.groupSelectStore.setSearchTerm(term);
      this.personSelectStore.setSearchTerm(term);
    });
  }

  public select(modelType: MultiSelectSegment, okey: string): Promise<boolean> {
    return dismissOverlay(this.modalController, `${modelType}.${okey}`, 'confirm');
  }
}
