import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { MeetingModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, hasRole } from '@okr/shared-util-core';

import { MeetingStore } from './meeting.store';

@Component({
  selector: 'okr-meeting-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonNote, IonPopover, IonGrid, IonRow, IonCol,
  ],
  providers: [MeetingStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.plural() }}</ion-title>
        @if (!readOnly()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true"
              [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content><okr-menu [menuName]="contextMenuName()" /></ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        (tagChanged)="store.setSelectedTag($event)"
        [tags]="tags()"
      />

      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="3"><ion-label><strong>{{ store.i18n.meetingDate_label() }}</strong></ion-label></ion-col>
            <ion-col size="6"><ion-label><strong>{{ store.i18n.name_label() }}</strong></ion-label></ion-col>
            <ion-col size="3" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.state_label() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (meeting of filtered(); track meeting.okey) {
            <ion-item button [detail]="false" (click)="showActions(meeting)">
              <ion-label>
                <h2>{{ meeting.name }}</h2>
                <p class="ion-hide-sm-down">{{ viewDate(meeting) }} {{ meeting.startTime }}</p>
              </ion-label>
              <ion-note slot="end" class="ion-hide-md-down">{{ meeting.state }}</ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class MeetingList {
  protected readonly store = inject(MeetingStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // inputs — the route supplies both
  public readonly listId = input('all');
  public readonly contextMenuName = input.required<string>();

  // derived
  protected readonly count = computed(() => this.store.meetingsCount());
  protected readonly filtered = computed(() => this.store.filteredMeetings() ?? []);
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('privileged', this.currentUser()));
  protected readonly tags = computed(() => this.store.getTags());
  protected readonly popupId = computed(() => `c_meetings_${this.listId()}`);

  constructor() {
    effect(() => this.store.setListId(this.listId()));
  }

  protected viewDate(meeting: MeetingModel): string {
    return convertDateFormatToString(meeting.meetingDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
  }

  /*-------------------------- list-level actions --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    switch ($event.detail.data) {
      case 'add': await this.store.add(this.readOnly()); break;
      case undefined: break;   // popover dismissed without a selection
      default: this.alertService.error(`MeetingList.onPopoverDismiss: unknown method ${$event.detail.data}`);
    }
  }

  /*-------------------------- per-item actions --------------------------------*/
  protected async showActions(meeting: MeetingModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options);
    await this.executeActions(options, meeting);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    if (this.readOnly()) {
      options.buttons.push(createActionSheetButton('meeting.view', this.store.i18n.view_label(), this.imgixBaseUrl, 'eye-on'));
    } else {
      options.buttons.push(createActionSheetButton('meeting.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('meeting.minutes', this.store.i18n.as_minutes(), this.imgixBaseUrl, 'document'));
      options.buttons.push(createActionSheetButton('meeting.pdf', this.store.i18n.as_pdf(), this.imgixBaseUrl, 'print'));
      if (hasRole('admin', this.currentUser())) {
        options.buttons.push(createActionSheetButton('meeting.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
      }
    }
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];
  }

  private async executeActions(options: ActionSheetOptions, meeting: MeetingModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'meeting.view':    await this.store.edit(meeting, true); break;
      case 'meeting.edit':    await this.store.edit(meeting, this.readOnly()); break;
      case 'meeting.minutes': await this.store.edit(meeting, this.readOnly(), true); break;
      case 'meeting.pdf':     await this.store.generateMinutesPdf(meeting); break;
      case 'meeting.delete':  await this.store.delete(meeting, this.readOnly()); break;
    }
  }
}
