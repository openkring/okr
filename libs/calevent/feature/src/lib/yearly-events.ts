import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ActionSheetController } from '@ionic/angular';
import { Router } from '@angular/router';

import { CalEventModel, RoleName } from '@okr/shared-models';
import { LabelPipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error, navigateByUrl } from '@okr/shared-util-angular';
import { extractSecondPartOfOptionalTupel, getYearFromDate, hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { AvatarDisplay } from '@okr/avatar-ui';

import { CalEventStore } from './calevent.store';

/** Sentinel understood by yearMatches() as "do not filter by year". */
const ALL_YEARS = 99;

/** The four sortable columns of the list — same interaction as `CalEventList`. */
type YearlyEventSortField = 'year' | 'responsible' | 'location' | 'description';

@Component({
    selector: 'okr-yearly-events',
    standalone: true,
    imports: [
    SvgIconPipe, LabelPipe,
    Spinner, EmptyList, Menu, ListFilter, AvatarDisplay,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover
],
    providers: [CalEventStore],
    styles: [`
      .clickable { cursor: pointer; user-select: none; }
    `],
    template: `
    <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ filteredCalEventsCount()}}/{{calEventsCount()}} {{ store.i18n.calevents() }}</ion-title>
      <ion-buttons slot="end">
        @if(hasRole('privileged') || hasRole('eventAdmin')) {
          <ion-buttons slot="end">
            <ion-button id="c-yevents">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="c-yevents" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-buttons>
    </ion-toolbar>

    <!-- search and filters -->
    <okr-list-filter
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-grid>
        <ion-row>
          <ion-col size="6" size-md="4" size-lg="3" class="clickable" (click)="setSort('year')">
            <ion-label><strong>{{ store.i18n.year() }}{{ sortIcon('year') }}</strong></ion-label>
          </ion-col>
          <ion-col size-md="4" size-lg="3" class="ion-hide-md-down clickable" (click)="setSort('responsible')">
            <ion-label><strong>{{ store.i18n.responsible() }}{{ sortIcon('responsible') }}</strong></ion-label>
          </ion-col>
          <ion-col size="6" size-md="4" size-lg="3" class="clickable" (click)="setSort('location')">
            <ion-label><strong>{{ store.i18n.location() }}{{ sortIcon('location') }}</strong></ion-label>
          </ion-col>
          <ion-col size-lg="3" class="ion-hide-lg-down clickable" (click)="setSort('description')">
            <ion-label><strong>{{ store.i18n.description() }}{{ sortIcon('description') }}</strong></ion-label>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  </ion-header>

  <!-- list data -->
  <ion-content #content>
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      @if(filteredCalEventsCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(event of filteredCalEvents(); track event.okey) {
            <ion-item (click)="showActions(event)">
              <!-- The column header is "Jahr": show the year the event falls in, not the event
                   name, which repeats the tenant and the year in every row ("P13 Event 2024"). -->
              <ion-label>{{ getYearFromDate(event.startDate) }}</ion-label>
              <ion-label class="ion-hide-md-down"><okr-avatar-display [avatars]="event.responsiblePersons" [showName]="true" /></ion-label>
              <ion-label class="ion-hide-md-up"><okr-avatar-display [avatars]="event.responsiblePersons" [showName]="false" /></ion-label>
              <ion-label>{{ event.locationKey | label }}</ion-label>
              <ion-label class="ion-hide-lg-down">{{ event.description }}</ion-label>
              <!-- a configured link opens in the same tab; the click must not open the ActionSheet.
                   The href stays on the anchor so hover/copy-link/middle-click keep working, but a
                   plain left click is routed through the Router: an in-app url must not reload the
                   whole SPA (openLink hands genuine externals back to the browser). -->
              @if(event.url) {
                <a slot="end" [href]="event.url" [title]="event.urlLabel || event.url" rel="noopener noreferrer" (click)="openLink($event, event.url)">
                  <ion-icon src="{{'link' | svgIcon }}" />
                </a>
              }
            </ion-item>
          }
        </ion-list>
      }
    }
  </ion-content>
    `
})
export class YearlyEvents {
  protected store = inject(CalEventStore);
  private actionSheetController = inject(ActionSheetController);
  private router = inject(Router);

  // inputs
  public listId = input.required<string>();     // calendar name
  public contextMenuName = input.required<string>();

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());
  protected selectedType = linkedSignal(() => this.store.selectedCategory());

  // data
  protected calEventsCount = computed(() => this.store.calEventsCount());
  // sort state — local to the component, like in CalEventList; 'year' reproduces the store's order.
  private readonly sortField = signal<YearlyEventSortField>('year');
  private readonly sortAsc = signal(true);

  /**
   * `location` sorts by what the column shows (the `label` pipe part of `locationKey`),
   * `responsible` by the last name of the first responsible person.
   */
  protected filteredCalEvents = computed(() => {
    const list = this.store.filteredCalEvents() ?? [];
    const field = this.sortField();
    const dir = this.sortAsc() ? 1 : -1;
    return [...list].sort((a, b) => dir * (
      field === 'responsible' ? this.responsibleName(a).localeCompare(this.responsibleName(b)) :
      field === 'location'    ? this.locationLabel(a).localeCompare(this.locationLabel(b)) :
      field === 'description' ? (a.description ?? '').localeCompare(b.description ?? '') :
                                (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime)
    ));
  });
  protected filteredCalEventsCount = computed(() => this.filteredCalEvents().length);
  protected isLoading = computed(() => this.store.isLoading());
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('calevent_type'));
  private currentUser = computed(() => this.store.appStore.currentUser());
  protected readOnly = computed(() => !hasRole('eventAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));
  /** Template access to the StoreDate -> yyyy helper. */
  protected readonly getYearFromDate = getYearFromDate;

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setCalendarName(this.listId()));
    // A yearly-events list that shows one year is pointless: the whole screen is the history
    // of the anniversary event across the years. Pin the store's year filter to the
    // 'all years' sentinel (see yearMatches) and offer no year filter in the UI.
    this.store.setSelectedYear(ALL_YEARS);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'add':  await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export("raw"); break;
      default: error(undefined, `YearlyEvents.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Opens the link configured on a CalEvent. The click must never reach the row (that would open
   * the ActionSheet). A url that points back into the app is routed by the Router so the
   * transition stays inside the SPA instead of reloading the whole app; navigateByUrl recognizes
   * a same-origin absolute url and hands a genuine external one to the browser.
   * A modified click (new tab/window, download) is left to the browser untouched.
   */
  protected openLink($event: MouseEvent, url: string): void {
    $event.stopPropagation();
    if ($event.button !== 0 || $event.ctrlKey || $event.metaKey || $event.shiftKey || $event.altKey) return;
    $event.preventDefault();
    navigateByUrl(this.router, url).catch(ex => error(undefined, 'YearlyEvents.openLink: ' + ex));
  }

  /**
   * Displays an ActionSheet with all possible actions on a CalEvent. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param calEvent 
   */
  protected async showActions(calEvent: CalEventModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions, calEvent);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('album', this.store.i18n.view_album(), this.imgixBaseUrl, 'albums'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('calevent.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param calEvent 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, calEvent: CalEventModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'calevent.delete':
          await this.store.delete(calEvent, this.readOnly());
          break;
        case 'calevent.edit':
          await this.store.edit(calEvent, false, this.readOnly());
          break;
        case 'calevent.view':
          await this.store.edit(calEvent, false, true);
          break;
        case 'album':
          await this.store.showAlbum(calEvent.url);
          break;
      }
    }
  }

  /******************************* change notifications *************************************** */
  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected($event: string): void {
    this.store.setSelectedTag($event);
  }

  protected onTypeSelected(calEventType: string): void {
    this.store.setSelectedCategory(calEventType);
  }

  /******************************* sorting *************************************** */
  /** The sort marker appended to the active column header. */
  protected sortIcon(field: YearlyEventSortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? ' ↑' : ' ↓';
  }

  /** Click a header: sort by it ascending, click the active one again to reverse. */
  protected setSort(field: YearlyEventSortField): void {
    this.sortAsc.set(this.sortField() === field ? !this.sortAsc() : true);
    this.sortField.set(field);
  }

  /** The location text shown in the column — identical to the `label` pipe on `locationKey`. */
  private locationLabel(event: CalEventModel): string {
    return extractSecondPartOfOptionalTupel(event.locationKey ?? '', '@');
  }

  /** The last name of the first responsible person, i.e. what the column leads with. */
  private responsibleName(event: CalEventModel): string {
    return event.responsiblePersons?.[0]?.name2 ?? '';
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
