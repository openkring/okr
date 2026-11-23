import { Component, computed, inject, input, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { InfiniteScrollCustomEvent, IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular';

import { NameDisplay, PersonModel, PersonModelName, RoleName } from '@okr/shared-models';
import { FullNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner, ImgDirective } from '@okr/shared-ui';
import { AlertService } from '@okr/shared-util-angular';
import { getFullName, getPhotoUsageName, hasPhotoRestriction, hasRole, objectsToPhotos, contextMenuId } from '@okr/shared-util-core';
import { getPhotoUsageCategory } from '@okr/shared-categories';
import { SIZE_MD } from '@okr/shared-constants';
import { TranslatePipe } from '@okr/shared-i18n';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';

import { PersonActionsService } from './person-actions.service';
import { PersonStore } from './person.store';

type PersonSortField = 'name' | 'phone' | 'email';

@Component({
  selector: 'okr-person-list',
  standalone: true,
  imports: [
    ImgDirective, FullNamePipe, AvatarPipe, SvgIconPipe, TranslatePipe, AsyncPipe,
    Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonLabel, IonContent, IonItem, IonPopover,
    IonAvatar, IonList,
    IonInfiniteScroll, IonInfiniteScrollContent
  ],
  providers: [PersonStore, PersonActionsService],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    ion-icon.photo-flag { color: var(--ion-color-medium); font-size: 18px; }
    .clickable { cursor: pointer; user-select: none; }
  `],
  template: `
  <ion-header>
    <!-- title and actions -->
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title class="ion-hide-sm-down">{{ filteredPersonsCount()}}/{{personsCount()}} {{ store.i18n.persons() }}</ion-title>
      <ion-title class="ion-hide-sm-up">{{ filteredPersonsCount()}} {{ store.i18n.persons() }}</ion-title>
      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <ion-buttons slot="end">
          @if (menuItemsStore.canOpen(contextMenuName())) {
            <ion-button id="{{ popupId }}">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      }
    </ion-toolbar>

    <!-- search and filters -->
    <!-- the photo-declaration filter is a staff tool: it is what makes usageImages consultable
         at all (D-P4-10). Members do not get it — the declaration is not theirs to browse. -->
    <!-- ?filters=search,tags narrows the toolbar; ?filters=none hides it (handled by okr-list-filter) -->
    <okr-list-filter
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()" [hideTagsOnMobile]="true"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
      (categoryChanged)="onPhotoUsageSelected($event)" [categories]="photoUsageCategory()"
    />

    <!-- list header -->
    <ion-toolbar color="primary" class="ion-hide-sm-down">
      <ion-item lines="none" color="primary">
        <ion-label class="clickable" (click)="setSort('name')"><strong>{{ store.i18n.name() }}{{ sortIcon('name') }}</strong></ion-label>
        <ion-label class="clickable" (click)="setSort('phone')"><strong>{{ store.i18n.phone_label() }}{{ sortIcon('phone') }}</strong></ion-label>
        <ion-label class="ion-hide-md-down clickable" (click)="setSort('email')"><strong>{{ store.i18n.email_label() }}{{ sortIcon('email') }}</strong></ion-label>
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      @if(filteredPersonsCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <!-- Incremental rendering, same pattern as page-list/menu-list: 623 persons as 623
             ion-items at once (each with avatar, image and three labels) was the whole cost of
             this page — perf-baselines.md, »Die Personenliste« (2026-09-09). -->
        <ion-list lines="inset">
          @for(person of visiblePersons(); track person.okey) {
            <ion-item (click)="showActions(person)">
              <ion-avatar slot="start">
                <img okrImg src="{{ personModelName + '.' + person.okey | avatar:personModelName }}" alt="Avatar Logo" />
              </ion-avatar>
              <ion-label>{{person.firstName | fullName:person.lastName:nameDisplay()}}</ion-label>
              @if(showsPhotoFlag(person)) {
                <ion-icon slot="end" class="photo-flag" src="{{ photoFlagIcon(person) | svgIcon }}"
                  [title]="(photoFlagLabel(person) | translate | async) ?? ''" />
              }
              <ion-label class="ion-hide-sm-down">
                @if(favPhone(person); as phone) {
                  <span>{{phone}}</span>
                }
              </ion-label>
              <ion-label class="ion-hide-md-down">
                @if(favEmail(person); as email) {
                  <span>{{email}}</span>
                }
              </ion-label>
            </ion-item>
          }
        </ion-list>
        @if(hasMore()) {
          <ion-infinite-scroll (ionInfinite)="loadMore($event)">
            <ion-infinite-scroll-content />
          </ion-infinite-scroll>
        }
      }
    }
    </ion-content>
    `
})
export class PersonList {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly popupId = contextMenuId('c_persons');
  protected readonly store = inject(PersonStore);
  private readonly personActions = inject(PersonActionsService);
  private readonly alertService = inject(AlertService);

  // inputs
  public readonly listId = input.required<string>();
  public readonly contextMenuName = input.required<string>();

  // derived signals
  protected personsCount = computed(() => this.store.personsCount());
  // sort state
  private sortField = signal<PersonSortField>('name');
  private sortAsc   = signal(true);

  protected filteredPersons = computed(() => {
    const list = this.store.filteredPersons() ?? [];
    const field = this.sortField();
    const dir   = this.sortAsc() ? 1 : -1;
    const nameDisplay = this.nameDisplay();
    return [...list].sort((a, b) => dir * (
      field === 'phone' ? this.favPhone(a).localeCompare(this.favPhone(b)) :
      field === 'email' ? this.favEmail(a).localeCompare(this.favEmail(b)) :
                          getFullName(a.firstName, a.lastName, nameDisplay).localeCompare(getFullName(b.firstName, b.lastName, nameDisplay))
    ));
  });
  protected filteredPersonsCount = computed(() => this.filteredPersons().length);

  // incremental rendering (ion-infinite-scroll)
  private readonly pageSize = 50;
  protected readonly visibleCount = signal(this.pageSize);
  protected readonly visiblePersons = computed(() => this.filteredPersons().slice(0, this.visibleCount()));
  protected readonly hasMore = computed(() => this.visibleCount() < this.filteredPersons().length);
  protected isLoading = computed(() => this.store.isLoading());
  /** an empty string hides the tag filter; a tenant that hides person tags has none to filter by */
  protected readonly tags = computed(() => this.store.appStore.hiddenFields('person').has('tags') ? '' : this.store.getTags());
  protected readonly types = computed(() => this.store.appStore.getCategory('gender'));
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly nameDisplay = computed(() => this.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);
  private readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));


  // contact data from the address-directory projection (spec 1.19 Phase 4)
  protected favEmail(person: PersonModel): string {
    return this.store.appStore.getDirectoryEntry(`person.${person.okey}`)?.favEmail ?? '';
  }

  protected favPhone(person: PersonModel): string {
    return this.store.appStore.getDirectoryEntry(`person.${person.okey}`)?.favPhone ?? '';
  }
  protected personModelName = PersonModelName;

  /********************* photo declaration (usageImages, D-P4-10) ****************************** */
  // usageImages is a declaration honoured organisationally, not a rule. It is shown to the roles
  // that act on it — memberAdmin maintains member data, contentAdmin publishes pictures — so that
  // a member who declared an objection is not the only one who knows about it.
  protected readonly showsPhotoDeclaration = computed(() =>
    hasRole('contentAdmin', this.currentUser()) || hasRole('memberAdmin', this.currentUser()));

  protected readonly photoUsageCategory = computed(() =>
    this.showsPhotoDeclaration() ? getPhotoUsageCategory(this.store.appStore.tenantId()) : undefined);

  /** A row is flagged only when the person restricted the use of their picture. */
  protected showsPhotoFlag(person: PersonModel): boolean {
    return this.showsPhotoDeclaration() && hasPhotoRestriction(person.usageImages);
  }

  protected photoFlagIcon(person: PersonModel): string {
    return objectsToPhotos(person.usageImages) ? 'eye-off' : 'shield';
  }

  /** Data-driven key (depends on the person's tier) — the one sanctioned TranslatePipe case. */
  protected photoFlagLabel(person: PersonModel): string {
    return `@shared/categories.photoUsage.${getPhotoUsageName(person.usageImages)}.label`;
  }

  protected sortIcon(field: PersonSortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? ' ↑' : ' ↓';
  }

  /******************************** setters (filter/sort) ******************************************* */
  protected setSort(field: PersonSortField): void {
    this.sortAsc.set(this.sortField() === field ? !this.sortAsc() : true);
    this.sortField.set(field);
    this.visibleCount.set(this.pageSize);
  }

  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
    this.visibleCount.set(this.pageSize);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
    this.visibleCount.set(this.pageSize);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedGender(type);
    this.visibleCount.set(this.pageSize);
  }

  protected onPhotoUsageSelected(photoUsage: string): void {
    this.store.setSelectedPhotoUsage(photoUsage);
    this.visibleCount.set(this.pageSize);
  }

  protected loadMore(event: InfiniteScrollCustomEvent): void {
    this.visibleCount.update((c) => c + this.pageSize);
    event.target.complete();
  }

  /******************************** actions ******************************************* */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export('raw'); break;
      case 'copyEmailAddresses': await this.store.copyEmailAddresses(); break;
      // 'sendEmailToList': the pre-migration menu row (scripts/migrate-comm-center-menu.mjs), kept until every app is released
      case 'sendEmailToList':
      case 'commCenter': await this.store.openCommCenter(); break;
      case 'importVcards': await this.store.importVcards(); break;
      case 'openContactsDav': await this.store.openContactsDav(); break;
      case 'checkFavAddresses': await this.store.checkFavAddresses(); break;
      default: this.alertService.error(`PersonList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Person. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param person 
   */
  protected async showActions(person: PersonModel): Promise<void> {
    await this.personActions.show(person, 'full');
  }

  /******************************** helpers ******************************************* */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}

