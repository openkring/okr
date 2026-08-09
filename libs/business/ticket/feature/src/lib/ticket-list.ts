import { Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, IonCol, IonContent, IonGrid, IonHeader, IonLabel, IonMenuButton, IonRow,
  IonButtons, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';
import type { ActionSheetOptions } from '@ionic/angular/standalone';

import { TicketModel } from '@okr/shared-models';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';
import { isSlaBreached, ticketStatusCategory } from '@okr/business-ticket-util';

import { TicketStore } from './ticket.store';

/**
 * The 3LS escalation queue (C4 §1) — one queue, at bkaiser, in `kring`.
 *
 * Partners never reach this route. They submit, list and comment through the callables, which
 * authenticate against `PartnerModel.serviceUid`; `tickets` is admin-read-only in `firestore.rules`
 * because "my tickets, never another partner's" is a predicate over document content and Firestore
 * cannot evaluate one for a list query. Same argument as the prospect pool, not re-derived.
 *
 * The title counts **breached**, not open. An escalation inside its deadline is the queue working;
 * what an operator has to act on today is the one that has run out of time, with the partner's own
 * waiting days already given back (C4 §5).
 */
@Component({
  selector: 'okr-ticket-list',
  standalone: true,
  imports: [
    Spinner, ListFilter, EmptyList,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton,
    IonContent, IonGrid, IonRow, IonCol, IonLabel,
  ],
  providers: [TicketStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.breachedCount() }}/{{ ticketsCount() }} {{ store.i18n.plural() }}</ion-title>
      </ion-toolbar>
      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        (typeChanged)="store.setSelectedStatus($event)" [types]="statuses()" />

      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="5" size-md="4"><ion-label><strong>{{ store.i18n.header_name() }}</strong></ion-label></ion-col>
            <ion-col size="3" size-md="2"><ion-label><strong>{{ store.i18n.header_partner() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.header_version() }}</strong></ion-label></ion-col>
            <ion-col size="4" size-md="2"><ion-label><strong>{{ store.i18n.header_status() }}</strong></ion-label></ion-col>
            <ion-col size="2" class="ion-hide-md-down"><ion-label><strong>{{ store.i18n.header_class() }}</strong></ion-label></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if(store.isLoading()) {
        <okr-spinner />
      } @else if(filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(ticket of store.filteredTickets(); track ticket.okey) {
            <ion-row (click)="showActions(ticket)">
              <ion-col size="5" size-md="4">
                <ion-label>{{ ticket.name }}<br /><small>{{ ticket.affectedTenantId }}</small></ion-label>
              </ion-col>
              <ion-col size="3" size-md="2"><ion-label>{{ store.partnerName(ticket.partnerKey) }}</ion-label></ion-col>
              <ion-col size="2" class="ion-hide-md-down"><ion-label>{{ ticket.appVersion }}</ion-label></ion-col>
              <ion-col size="4" size-md="2">
                <ion-label [color]="statusColor(ticket)">{{ store.statusLabel(ticket.status) }}</ion-label>
              </ion-col>
              <ion-col size="2" class="ion-hide-md-down">
                <ion-label>{{ classificationLabel(ticket) }}</ion-label>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `,
})
export class TicketList {
  protected readonly store = inject(TicketStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  // inputs — no `:contextMenuName`: every action belongs to one ticket and is reached from the row,
  // so a list-level context menu would mean a menu document in Firestore with nothing in it.
  public readonly listId = input('all');

  constructor() {
    // 'all' is the whole queue; any other listId is a status the menu can deep-link to.
    effect(() => this.store.setSelectedStatus(this.listId() === 'all' ? '' : this.listId()));
  }

  protected readonly filteredCount = computed(() => this.store.filteredTickets().length);
  protected readonly ticketsCount = computed(() => this.store.tickets().length);
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));
  protected readonly statuses = computed(() => ticketStatusCategory(this.store.appStore.tenantId()));

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /**
   * A breached ticket is red whatever its status — that is the only colour an operator scans for.
   * `rejected` is grey, not red: refusing an out-of-window submission is the §3 gate doing its job.
   */
  protected statusColor(ticket: TicketModel): string {
    if (isSlaBreached(ticket, 'workaround') || isSlaBreached(ticket, 'fix')) return 'danger';
    switch (ticket.status) {
      case 'resolved':
      case 'closed':              return 'success';
      case 'waiting-on-partner':  return 'warning';
      case 'rejected':            return 'medium';
      default:                    return 'dark';
    }
  }

  protected classificationLabel(ticket: TicketModel): string {
    switch (ticket.classification) {
      case 'defect':            return this.store.i18n.class_defect();
      case 'misconfiguration':  return this.store.i18n.class_misconfiguration();
      case 'how-to':            return this.store.i18n.class_howto();
      default:                  return this.store.i18n.class_unclassified();
    }
  }

  protected async showActions(ticket: TicketModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, ticket);
    await this.executeActions(options, ticket);
  }

  /**
   * Transitions are offered by state, not all at once: "resume" on a ticket nobody is waiting on
   * would write a `waitingDays` interval that never happened, and the util silently ignores it —
   * an action that appears to work and does nothing is worse than one that is not there.
   */
  private addActionSheetButtons(options: ActionSheetOptions, ticket: TicketModel): void {
    options.buttons.push(createActionSheetButton('ticket.open', this.store.i18n.as_open(), this.imgixBaseUrl, 'eye-on'));
    if (!this.readOnly() && ticket.status !== 'closed' && ticket.status !== 'rejected') {
      options.buttons.push(createActionSheetDivider());
      if (ticket.status === 'submitted') {
        options.buttons.push(createActionSheetButton('ticket.accept', this.store.i18n.as_accept(), this.imgixBaseUrl, 'checkmark'));
      }
      if (ticket.status === 'waiting-on-partner') {
        options.buttons.push(createActionSheetButton('ticket.resume', this.store.i18n.as_resume(), this.imgixBaseUrl, 'play'));
      } else {
        options.buttons.push(createActionSheetButton('ticket.wait', this.store.i18n.as_wait(), this.imgixBaseUrl, 'stop'));
      }
      if (ticket.workaroundAt.length === 0) {
        options.buttons.push(createActionSheetButton('ticket.workaround', this.store.i18n.as_workaround(), this.imgixBaseUrl, 'bulb'));
      }
      options.buttons.push(createActionSheetButton('ticket.comment', this.store.i18n.as_comment(), this.imgixBaseUrl, 'chat'));
      options.buttons.push(createActionSheetButton('ticket.close', this.store.i18n.as_close(), this.imgixBaseUrl, 'lock-closed'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, ticket: TicketModel): Promise<void> {
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'ticket.open':       await this.router.navigateByUrl(`/ticket/detail/${ticket.okey}`); break;
      case 'ticket.accept':     await this.store.triage(ticket, 'accept'); break;
      case 'ticket.wait':       await this.store.triage(ticket, 'wait'); break;
      case 'ticket.resume':     await this.store.triage(ticket, 'resume'); break;
      case 'ticket.workaround': await this.store.triage(ticket, 'workaround'); break;
      case 'ticket.close':      await this.store.triage(ticket, 'close'); break;
      case 'ticket.comment':    await this.store.comment(ticket); break;
      case 'cancel': break;
      default: this.alertService.error(`TicketList.showActions: unknown action ${data.action}`);
    }
  }
}
