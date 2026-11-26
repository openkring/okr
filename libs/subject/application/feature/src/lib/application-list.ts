import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  ActionSheetController, ActionSheetOptions,
  IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader,
  IonIcon, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar
} from '@ionic/angular';

import { ApplicationModel } from '@okr/shared-models';
import { isMembershipApplication } from '@okr/application-util';
import { contextMenuId, hasRole } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter } from '@okr/shared-ui';
import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';

import { ApplicationListFilter, ApplicationStore } from './application.store';

/**
 * All applications (Anmeldungen) of the tenant, newest first — under «Mitglieder» for memberAdmin and privileged.
 * Columns: date, first name, last name, type (`applicationAs`); filters: search, type, state, kind/duplicates.
 * List actions come from the DB context menu (`c-application`: add, export); row actions from the ActionSheet.
 */
@Component({
  selector: 'okr-application-list',
  standalone: true,
  imports: [
    DatePipe, SvgIconPipe,
    EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonPopover,
    IonIcon, IonContent, IonGrid, IonRow, IonCol, IonLabel, IonChip
  ],
  providers: [ApplicationStore],
  styles: [`
    ion-row.data-row { cursor: pointer; border-bottom: 1px solid var(--ion-color-light); align-items: center; }
    ion-row.data-row:hover { background-color: var(--ion-color-light); }
    ion-chip { margin: 0 4px 0 0; }
  `],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ store.filteredApplications().length }} {{ store.i18n.list_title() }}</ion-title>
      <ion-buttons slot="end">
        @if(canManage() && menuItemsStore.canOpen(contextMenuName())) {
          <ion-button id="{{ popupId }}">
            <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true"
            [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content><okr-menu [menuName]="contextMenuName()" /></ion-content>
            </ng-template>
          </ion-popover>
        }
      </ion-buttons>
    </ion-toolbar>
    <okr-list-filter
      (searchTermChanged)="store.setSearchTerm($event)"
      [types]="store.kindCategory()"
      [selectedType]="store.kindFilter()"
      (typeChanged)="store.setKindFilter($event)"
      [states]="store.stateCategory()"
      [selectedState]="store.stateFilter()"
      (stateChanged)="store.setStateFilter($event)"
      [showIcons]="false"
      [strings]="forLabels()"
      [stringsName]="'applicationFor'"
      [stringsLabel]="store.i18n.list_filter_label()"
      [selectedString]="forLabel()"
      (stringsChanged)="onForFilterChange($event)"
    />
    <ion-toolbar color="primary">
      <ion-grid>
        <ion-row>
          <ion-col size="3" size-md="2"><ion-label><strong>{{ store.i18n.list_col_submitted() }}</strong></ion-label></ion-col>
          <ion-col size="4" size-md="3"><ion-label><strong>{{ store.i18n.firstname() }}</strong></ion-label></ion-col>
          <ion-col size="5" size-md="3"><ion-label><strong>{{ store.i18n.lastname() }}</strong></ion-label></ion-col>
          <ion-col size-md="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.list_col_type() }}</strong></ion-label></ion-col>
          <ion-col size-md="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.state() }}</strong></ion-label></ion-col>
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    @if(store.filteredApplications().length === 0) {
      <okr-empty-list [message]="store.i18n.list_empty()" />
    } @else {
      <ion-grid>
        @for(app of store.filteredApplications(); track app.okey) {
          <ion-row class="data-row" (click)="showActions(app)">
            <ion-col size="3" size-md="2"><ion-label>{{ app.submittedAt | date:'dd.MM.yyyy' }}</ion-label></ion-col>
            <ion-col size="4" size-md="3"><ion-label>{{ app.firstName }}</ion-label></ion-col>
            <ion-col size="5" size-md="3">
              <ion-label>{{ app.lastName }}</ion-label>
              @if(store.isDuplicate(app)) {
                <ion-chip color="warning" outline="true">{{ store.i18n.list_duplicate() }}</ion-chip>
              }
            </ion-col>
            <ion-col size-md="2" class="ion-hide-md-down"><ion-label>{{ store.kindLabel(app.applicationAs) }}</ion-label></ion-col>
            <ion-col size-md="2" class="ion-hide-md-down">
              <ion-chip [color]="store.stateColor(app.state)">{{ store.stateLabel(app) }}</ion-chip>
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    }
  </ion-content>
  `
})
export class ApplicationList {
  protected readonly store = inject(ApplicationStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly popupId = contextMenuId('c_applications');

  /** the `menuItems` doc of the header's context menu (route segment); default for the bare `/applications` route */
  public readonly contextMenuName = input('c-application');

  // the route guard admits privileged and memberAdmin (isMemberAdminGuard); the rules allow both to update
  protected canManage = computed(() => hasRole('privileged', this.store.currentUser()) || hasRole('memberAdmin', this.store.currentUser()));
  protected isPrivileged = computed(() => hasRole('privileged', this.store.currentUser()));

  // the strings filter lists plain strings: the translated labels are the options, mapped back to the filter value
  private readonly forOptions = computed<{ value: ApplicationListFilter; label: string }[]>(() => [
    { value: 'all',        label: this.store.i18n.list_filter_all() },
    { value: 'membership', label: this.store.i18n.list_filter_membership() },
    { value: 'course',     label: this.store.i18n.list_filter_course() },
    { value: 'duplicates', label: this.store.i18n.list_filter_duplicates() },
  ]);
  protected readonly forLabels = computed(() => this.forOptions().map(o => o.label));
  protected readonly forLabel = computed(() => this.forOptions().find(o => o.value === this.store.forFilter())?.label ?? '');

  protected onForFilterChange(label: string): void {
    this.store.setForFilter(this.forOptions().find(o => o.label === label)?.value ?? 'all');
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const method = $event.detail.data;
    if (!method) return;   // dismissed without a choice
    switch (method) {
      case 'add':    await this.store.addApplication(); break;
      case 'export': await this.store.exportApplications(); break;
      default: this.alertService.error(`ApplicationList.onPopoverDismiss: unknown method ${method}`);
    }
  }

  protected async showActions(app: ApplicationModel): Promise<void> {
    const options = createActionSheetOptions(`${app.firstName} ${app.lastName}`.trim() || this.store.i18n.list_title());
    this.addActionSheetButtons(options, app);
    await this.executeActions(options, app);
  }

  /**
   * Fixed order: Anmeldung ändern · E-Mail senden · Anrufen · Als Person erfassen · Kurs zuteilen ·
   * Annehmen, Ablehnen · Mitgliedschaft hinzufügen · Zusammenführen … · Löschen · Abbrechen.
   * A course registration creates no member: «Annehmen» and «Mitgliedschaft hinzufügen» are for memberships only;
   * «Als Person erfassen» is for every open application without a person, course registrations included (A8).
   */
  private addActionSheetButtons(opts: ActionSheetOptions, app: ApplicationModel): void {
    if (!this.canManage()) return;
    const imgix = this.store.imgixBaseUrl();
    const isOpen = app.state === 'applied' || app.state === 'reviewing';
    const isMembership = isMembershipApplication(app);

    opts.buttons.push(createActionSheetButton('application.edit', this.store.i18n.edit_label(), imgix, 'edit'));
    if (app.email) opts.buttons.push(createActionSheetButton('application.email', this.store.i18n.email_label(), imgix, 'email'));
    if (app.phone) opts.buttons.push(createActionSheetButton('application.call', this.store.i18n.call_label(), imgix, 'tel'));
    if (isOpen && !app.personKey) opts.buttons.push(createActionSheetButton('application.person', this.store.i18n.person_label(), imgix, 'person'));
    if (isOpen) opts.buttons.push(createActionSheetButton('application.course', this.store.i18n.course_assign_label(), imgix, 'send'));

    opts.buttons.push(createActionSheetDivider());
    if (isOpen) {
      if (isMembership) opts.buttons.push(createActionSheetButton('application.accept', this.store.i18n.accept(), imgix, 'check'));
      opts.buttons.push(createActionSheetButton('application.deny', this.store.i18n.deny(), imgix, 'stop-circle'));
    }
    if (isMembership && app.personKey) {
      opts.buttons.push(createActionSheetButton('application.membership', this.store.i18n.add_membership(), imgix, 'person-add'));
    }
    if (this.store.isDuplicate(app)) {
      opts.buttons.push(createActionSheetButton('application.merge', this.store.i18n.merge_label(), imgix, 'copy'));
    }
    if (this.isPrivileged()) {
      opts.buttons.push(createActionSheetButton('application.delete', this.store.i18n.delete(), imgix, 'trash'));
    }
    opts.buttons.push(createActionSheetDivider());
    opts.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), imgix, 'cancel-circle'));
  }

  private async executeActions(opts: ActionSheetOptions, app: ApplicationModel): Promise<void> {
    if (!opts.buttons.some(b => typeof b !== 'string' && b.data?.action && b.data.action !== 'cancel')) return;
    const sheet = await this.actionSheetController.create(opts);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action) return;
    switch (data.action) {
      case 'application.edit':       await this.store.editApplication(app); break;
      case 'application.email':      await this.store.sendEmail(app); break;
      case 'application.call':       await this.store.call(app); break;
      case 'application.person':     await this.store.createPerson(app); break;
      case 'application.course':     await this.store.assignCourse(app); break;
      case 'application.accept':     await this.store.acceptApplication(app); break;
      case 'application.deny':       await this.store.denyApplication(app); break;
      case 'application.membership': await this.store.addMembership(app); break;
      case 'application.merge':      await this.store.mergeApplication(app); break;
      case 'application.delete':     await this.store.deleteApplication(app); break;
    }
  }
}
