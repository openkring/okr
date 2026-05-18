import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonAvatar, IonContent, IonImg, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, ModalController } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { GroupModelName, OrgModel, OrgModelName, PersonModel, PersonModelName, UserModel } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { FullNamePipe } from '@bk2/shared-pipes';

const MultiSelectStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      org_label:    '@subject.org.operation.select.label',
      group_label:  '@subject.group.operation.select.label',
      person_label: '@subject.person.operation.select.label',
    }),
  })),
);
import { EmptyList, Header, Spinner } from '@bk2/shared-ui';
import { AvatarPipe } from '@bk2/avatar-ui';

import { GroupSelectStore } from './group-select.store';
import { OrgSelectStore } from './org-select.store';
import { PersonSelectStore } from './person-select.store';

export type MultiSelectSegment = 'org' | 'group' | 'person';

@Component({
  selector: 'bk-multi-select-modal',
  standalone: true,
  imports: [
    FormsModule,
    Header, Spinner, FullNamePipe, AvatarPipe, EmptyList,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList,
    IonSegment, IonSegmentButton,
  ],
  providers: [MultiSelectStore, OrgSelectStore, GroupSelectStore, PersonSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    ion-list { padding: 0px; }
    ion-segment { margin: 8px 0; }
  `],
  template: `
    <bk-header
      [(searchTerm)]="searchTerm"
      [isSearchable]="true"
      title="@shared.operation.select.label"
      [isModal]="true"
    />
    <ion-content>
      @if(segments().length > 1) {
        <ion-segment [(ngModel)]="activeSegment">
          @for(segment of segments(); track segment) {
            <ion-segment-button [value]="segment">
              <ion-label>{{ getSegmentLabel(segment) }}</ion-label>
            </ion-segment-button>
          }
        </ion-segment>
      }

      @if(activeSegment() === 'org') {
        @if(orgIsLoading()) {
          <bk-spinner />
        } @else if(filteredOrgs().length === 0) {
          <bk-empty-list message="@subject.org.field.empty" />
        } @else {
          <ion-list lines="none">
            @for(org of filteredOrgs(); track $index) {
              <ion-item class="item" (click)="select('org', org.bkey)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'org.' + org.bkey | avatar:orgDefaultIcon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ org.name }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }

      @if(activeSegment() === 'group') {
        @if(groupIsLoading()) {
          <bk-spinner />
        } @else if(filteredGroups().length === 0) {
          <bk-empty-list message="@subject.group.field.empty" />
        } @else {
          <ion-list lines="none">
            @for(group of filteredGroups(); track $index) {
              <ion-item class="item" (click)="select('group', group.bkey)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'group.' + group.bkey | avatar:group.icon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ group.name }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }

      @if(activeSegment() === 'person') {
        @if(personIsLoading()) {
          <bk-spinner />
        } @else if(filteredPersons().length === 0) {
          <bk-empty-list message="@subject.person.field.empty" />
        } @else {
          <ion-list lines="none">
            @for(person of filteredPersons(); track $index) {
              <ion-item class="item" (click)="select('person', person.bkey)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'person.' + person.bkey | avatar:personDefaultIcon }}" alt="Avatar Logo" />
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
  protected readonly store = inject(MultiSelectStore);
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
  protected filteredPersons = computed(() => this.personSelectStore.filteredPersons() ?? []);
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

  protected getSegmentLabel(segment: MultiSelectSegment): string {
    if (segment === 'org') return this.store.i18n.org_label();
    if (segment === 'group') return this.store.i18n.group_label();
    return this.store.i18n.person_label();
  }

  public select(modelType: MultiSelectSegment, bkey: string): Promise<boolean> {
    return this.modalController.dismiss(`${modelType}.${bkey}`, 'confirm');
  }
}
