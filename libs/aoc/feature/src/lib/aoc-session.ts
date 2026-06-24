// libs/aoc/feature/src/lib/aoc-session.ts
import { Component, computed, inject } from '@angular/core';
import { ActionSheetController, IonBadge, IonButton, IonButtons, IonCard, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, PopoverController } from '@ionic/angular/standalone';

import { SessionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString, generateRandomString } from '@bk2/shared-util-core';
import { getSessionStatus, getSessionStatusColor } from '@bk2/session-util';

import { AocSessionStore } from './aoc-session.store';

@Component({
  selector: 'bk-aoc-session',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonButton, IonTitle, IonIcon,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonList, IonItem, IonLabel, IonBadge, IonPopover,
  ],
  providers: [AocSessionStore],
  template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ totalCount() }} {{ store.i18n.session_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <ion-list>
                  <ion-item button (click)="dismissPopover('exportRaw')">
                    <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
                    <ion-label>{{ store.i18n.session_menu_export() }}</ion-label>
                  </ion-item>
                  <ion-item button (click)="dismissPopover('showStatistics')">
                    <ion-icon slot="start" src="{{ 'chart' | svgIcon }}" />
                    <ion-label>{{ store.i18n.session_menu_statistics() }}</ion-label>
                  </ion-item>
                  <ion-item button (click)="dismissPopover('changeDuration')">
                    <ion-icon slot="start" src="{{ 'calendar' | svgIcon }}" />
                    <ion-label>{{ store.i18n.session_menu_duration() }}</ion-label>
                  </ion-item>
                </ion-list>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>

      <!-- search and status filter -->
      <bk-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        [strings]="statusOptions()"
        [stringsName]="'sessionStatus'"
        [selectedString]="selectedStatusLabel()"
        (stringsChanged)="onStatusChange($event)"
      />

      <!-- list header -->
      <ion-toolbar color="primary">
        <ion-item lines="none" color="primary">
          <ion-label><strong>{{ store.i18n.session_col_user() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_browser() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_os() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_started() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_duration() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_status() }}</strong></ion-label>
        </ion-item>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <bk-spinner />
      } @else {
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              {{ store.uniqueUserCount() }} users &nbsp;|&nbsp;
              {{ store.anonymousCount() }} anonymous &nbsp;|&nbsp;
              {{ store.activeCount() }} active
            </ion-card-title>
          </ion-card-header>
        </ion-card>

        @if (sessions().length === 0) {
          <bk-empty-list [message]="store.i18n.session_empty()" />
        } @else {
          <ion-list lines="inset">
            @for (session of sessions(); track session.bkey) {
              <ion-item button (click)="showActions(session)">
                <ion-label>{{ session.userEmail || store.i18n.session_anonymous() }}</ion-label>
                <ion-label>{{ session.browser }}</ion-label>
                <ion-label>{{ session.os }}</ion-label>
                <ion-label>{{ formatDate(session.startedAt) }}</ion-label>
                <ion-label>{{ formatDuration(session) }}</ion-label>
                <ion-label>
                  <ion-badge [color]="statusColor(session)">{{ statusLabel(session) }}</ion-badge>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `,
})
export class AocSession {
  protected readonly store = inject(AocSessionStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly popoverController = inject(PopoverController);

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected readonly sessions = computed(() => this.store.filteredSessions());
  protected readonly filteredCount = computed(() => this.store.filteredSessions().length);
  protected readonly totalCount = computed(() => this.store.allSessions().length);
  protected readonly popupId = computed(() => `c_sessions_${generateRandomString(5)}`);

  private readonly statusValues: ReadonlyArray<'all' | 'active' | 'stale' | 'orphaned' | 'ended'> = ['all', 'active', 'stale', 'orphaned', 'ended'];
  protected readonly statusLabels = computed<Record<string, string>>(() => ({
    all: this.store.i18n.session_status_all(),
    active: this.store.i18n.session_status_active(),
    stale: this.store.i18n.session_status_stale(),
    orphaned: this.store.i18n.session_status_orphaned(),
    ended: this.store.i18n.session_status_ended(),
  }));
  protected readonly statusOptions = computed(() => this.statusValues.map(v => this.statusLabels()[v]));
  protected readonly selectedStatusLabel = computed(() => this.statusLabels()[this.store.selectedStatus()]);
  protected onStatusChange(label: string): void {
    const match = this.statusValues.find(v => this.statusLabels()[v] === label);
    this.store.setStatus(match ?? 'all');
  }

  /* ---------------- context menu ---------------- */
  protected async dismissPopover(action: string): Promise<void> {
    await this.popoverController.dismiss(action);
  }

  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const method = $event.detail.data;
    switch (method) {
      case 'exportRaw': await this.store.export('raw'); break;
      case 'showStatistics': await this.store.showStatistics(); break;
      case 'changeDuration': await this.store.changeDuration(); break;
    }
  }

  /* ---------------- ActionSheet ---------------- */
  protected async showActions(session: SessionModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.session_as_title());
    options.buttons.push(createActionSheetButton('session.view', this.store.i18n.session_view(), this.imgixBaseUrl, 'eye-on'));
    if (session.userKey) {
      options.buttons.push(createActionSheetButton('session.editUser', this.store.i18n.session_edit_user(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('session.editPerson', this.store.i18n.session_edit_person(), this.imgixBaseUrl, 'person'));
      options.buttons.push(createActionSheetButton('session.hideUser', this.store.i18n.session_hide_user(), this.imgixBaseUrl, 'eye-off'));
    }
    options.buttons.push(createActionSheetButton('cancel', 'Abbrechen', this.imgixBaseUrl, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'session.view': await this.store.viewSession(session); break;
      case 'session.editUser': await this.store.editUser(session); break;
      case 'session.editPerson': await this.store.editPerson(session); break;
      case 'session.hideUser': this.store.hideUser(session); break;
    }
  }

  /* ---------------- formatting ---------------- */
  protected formatDate(sdt: string): string {
    if (!sdt) return '—';
    return convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime);
  }

  protected formatDuration(session: SessionModel): string {
    if (session.isActive) return '—';
    const s = session.durationSeconds;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  protected statusLabel(session: SessionModel): string {
    return this.statusLabels()[getSessionStatus(session, Date.now())];
  }

  protected statusColor(session: SessionModel): string {
    return getSessionStatusColor(getSessionStatus(session, Date.now()));
  }
}
