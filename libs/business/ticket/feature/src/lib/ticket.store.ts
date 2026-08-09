import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CommentModel, TicketModel, TicketStatus } from '@okr/shared-models';
import { debugListLoaded, nameMatches } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';

import { PartnerService } from '@okr/business-partner-data-access';
import { TicketService, TriageAction } from '@okr/business-ticket-data-access';
import { TICKET_I18N_KEYS, isSlaBreached } from '@okr/business-ticket-util';

export type TicketState = {
  searchTerm: string;
  /** '' = every status. The queue is worked by status far more often than by name. */
  selectedStatus: string;
  /** Set by the detail page; '' on the list. */
  ticketKey: string;
  isSaving: boolean;
};

const initialState: TicketState = {
  searchTerm: '',
  selectedStatus: '',
  ticketKey: '',
  isSaving: false,
};

/**
 * The 3LS escalation queue (C4), bkaiser-side.
 *
 * Every mutation here is a callable, never a Firestore write — `tickets` is `allow write: if false`
 * and the reasons are on `TicketService`. What this store adds is the ordering the two writes have
 * to happen in when the triage form is saved: **classification first, then severity**. The
 * classification is the audited one and may be refused for a missing reason (C4 §4), and a severity
 * change that had already gone through would leave the record saying the fix leg was renegotiated
 * on the strength of a classification that was never accepted.
 */
export const TicketStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    alertService: inject(AlertService),
    ticketService: inject(TicketService),
    partnerService: inject(PartnerService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(TICKET_I18N_KEYS),
  })),
  withProps((store) => ({
    ticketsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => store.ticketService.list().pipe(
        debugListLoaded<TicketModel>('TicketStore.tickets', params.currentUser),
      ),
    }),
    // A ticket stores a `partnerKey`, and a key is nobody an operator can act on. Same lookup as
    // the metering ledger and the prospect pool.
    partnersResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: () => store.partnerService.list(),
    }),
    commentsResource: rxResource({
      params: () => ({ ticketKey: store.ticketKey() }),
      stream: ({ params }) => store.ticketService.comments(params.ticketKey),
    }),
  })),

  withComputed((state) => ({
    tickets: computed(() => state.ticketsResource.value() ?? []),
    isLoading: computed(() => state.ticketsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    comments: computed<CommentModel[]>(() => state.commentsResource.value() ?? []),
    partnerNames: computed(() => new Map(
      (state.partnersResource.value() ?? []).map(p => [p.okey, p.name]))),
  })),

  withComputed((state) => ({
    filteredTickets: computed(() => state.tickets()
      .filter(t => nameMatches(t.index, state.searchTerm()))
      .filter(t => state.selectedStatus() === '' || t.status === state.selectedStatus())),
    /**
     * The header count. Breached, not open: an open ticket inside its deadline is the queue working
     * as designed, and a count of those tells an operator nothing they have to act on today.
     * `isSlaBreached` subtracts the banked waiting time, so a ticket we are waiting on the partner
     * for never appears here.
     */
    breachedCount: computed(() => state.tickets()
      .filter(t => isSlaBreached(t, 'workaround') || isSlaBreached(t, 'fix')).length),
    currentTicket: computed(() => state.tickets().find(t => t.okey === state.ticketKey())),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
    setSelectedStatus(selectedStatus: string) { patchState(store, { selectedStatus: selectedStatus ?? '' }); },
    setTicketKey(ticketKey: string) { patchState(store, { ticketKey }); },

    reload() { store.ticketsResource.reload(); store.commentsResource.reload(); },

    partnerName(partnerKey: string): string {
      return partnerKey ? (store.partnerNames().get(partnerKey) ?? partnerKey) : '';
    },

    statusLabel(status: TicketStatus): string {
      switch (status) {
        case 'accepted':            return store.i18n.status_accepted();
        case 'waiting-on-partner':  return store.i18n.status_waiting();
        case 'resolved':            return store.i18n.status_resolved();
        case 'closed':              return store.i18n.status_closed();
        case 'rejected':            return store.i18n.status_rejected();
        default:                    return store.i18n.status_submitted();
      }
    },

    /**
     * Save the triage form: the classification (audited, may be refused) and then the severity.
     *
     * Only the fields that actually changed are sent. A no-op `classifyTicket` would re-stamp
     * `classifiedAt` and `classifiedBy` on every save, which turns the audit trail into a record of
     * who last opened the screen rather than who made the decision.
     */
    async saveTriage(edited: TicketModel, original: TicketModel): Promise<void> {
      if (store.isSaving()) return;
      const classified = edited.classification !== original.classification
        || edited.classificationReason !== original.classificationReason;
      if (classified && edited.classificationReason.trim().length === 0) {
        store.alertService.error(store.i18n.classify_needsReason());
        return;
      }
      patchState(store, { isSaving: true });
      try {
        if (classified) {
          await store.ticketService.classify(edited.okey, edited.classification, edited.classificationReason);
        }
        if (edited.severity !== original.severity) {
          await store.ticketService.triage(edited.okey, 'severity', { severity: edited.severity });
        }
        if (edited.fixVersion !== original.fixVersion) {
          await store.ticketService.triage(edited.okey, 'fix', { fixVersion: edited.fixVersion });
        }
        await store.alertService.showToast(store.i18n.classify_conf());
        this.reload();
      } catch (error) {
        store.alertService.error(`${store.i18n.classify_error()} ${error}`);
      } finally {
        patchState(store, { isSaving: false });
      }
    },

    /** One state transition. The util banks the waiting time; nothing here recomputes a date. */
    async triage(ticket: TicketModel | undefined, action: TriageAction): Promise<void> {
      if (!ticket || store.isSaving()) return;
      patchState(store, { isSaving: true });
      try {
        await store.ticketService.triage(ticket.okey, action);
        await store.alertService.showToast(store.i18n.triage_conf());
        this.reload();
      } catch (error) {
        store.alertService.error(`${store.i18n.triage_error()} ${error}`);
      } finally {
        patchState(store, { isSaving: false });
      }
    },

    async comment(ticket: TicketModel | undefined): Promise<void> {
      if (!ticket) return;
      const text = await store.alertService.okrPrompt(
        store.i18n.comment_prompt(), store.i18n.comment_prompt());
      if (!text || text.trim().length === 0) return;
      try {
        await store.ticketService.comment(ticket.okey, text);
        await store.alertService.showToast(store.i18n.comment_conf());
        this.reload();
      } catch (error) {
        store.alertService.error(`${store.i18n.triage_error()} ${error}`);
      }
    },
  })),
);
