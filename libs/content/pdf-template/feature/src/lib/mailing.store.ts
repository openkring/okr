// libs/content/pdf-template/feature/src/lib/mailing.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CalEventModel, NameDisplay } from '@okr/shared-models';
import { DocEmailService, MailingLetters, MailingService } from '@okr/content-pdf-template-data-access';
import {
  deliveryByPerson, MAILING_I18N_KEYS, MAILING_VIEW_CHANNELS, MailingAnswer, mailingAnswerCounts, mailingAnswerOf, MailingDeliveries,
  MailingI18n, mailingRecipientsFor, MailingView,
} from '@okr/content-pdf-template-util';
import { getFullName, isOrgRecipient, nameMatches } from '@okr/shared-util-core';

/** One recipient row of the detail view: a name, never an address (privacy-model skill). */
export interface MailingRecipientRow {
  personKey: string;
  name: string;
}

/** One event of a Versand with answer links, with every recipient's answer. */
export interface MailingEventRow {
  key: string;
  event: CalEventModel | undefined;
  answers: (MailingRecipientRow & { answer: MailingAnswer })[];
  counts: Record<MailingAnswer, number>;
}

interface MailingState {
  searchTerm: string;
  mailingKey: string;
  /** what `getMailingLetters` answered; undefined until asked */
  letters: MailingLetters | undefined;
  lettersLoading: boolean;
  lettersError: boolean;
  /** what `getMailingDeliveries` answered (the mail server's reports); undefined until asked */
  deliveries: MailingDeliveries | undefined;
  deliveriesLoading: boolean;
  deliveriesError: boolean;
}

const initialState: MailingState = {
  searchTerm: '',
  mailingKey: '',
  letters: undefined,
  lettersLoading: false,
  lettersError: false,
  deliveries: undefined,
  deliveriesLoading: false,
  deliveriesError: false,
};

/**
 * The Versand overview (spec 1.145): the tenant's sent Versände and, for one of them, what became of
 * it. Read-only: the overview changes nothing, it only shows the `mailings` doc, its `mailJobs` doc,
 * and the events' attendee lists.
 */
export const MailingStore = signalStore(
  withState(initialState),
  withProps(() => ({
    i18n: inject(I18nService).translateAll(MAILING_I18N_KEYS) as MailingI18n,
    appStore: inject(AppStore),
    mailingService: inject(MailingService),
    docEmailService: inject(DocEmailService),
  })),
  withProps((store) => ({
    mailingsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: ({ params }) => store.mailingService.list(params.tenantId),
    }),
    mailingResource: rxResource({
      params: () => (store.mailingKey() ? { key: store.mailingKey() } : undefined),
      stream: ({ params }) => store.mailingService.read(params.key),
    }),
  })),
  withProps((store) => ({
    mailJobResource: rxResource({
      params: () => {
        const key = store.mailingResource.value()?.mailJobKey;
        return key ? { key } : undefined;
      },
      stream: ({ params }) => store.docEmailService.mailJob(params.key),
    }),
    eventsResource: rxResource({
      params: () => {
        const keys = store.mailingResource.value()?.caleventKeys ?? [];
        return keys.length > 0 ? { keys: keys.join(',') } : undefined;
      },
      stream: ({ params }) => {
        const keys = params.keys.split(',');
        return keys.length > 0 ? combineLatest(keys.map((key) => store.mailingService.readEvent(key))) : of([]);
      },
    }),
  })),
  withComputed((store) => {
    const nameDisplay = computed(() => store.appStore.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);
    /** personKey → display name; an org recipient is keyed `org.<okey>` */
    const names = computed(() => {
      const map = new Map<string, string>();
      for (const p of store.appStore.allPersons()) map.set(p.okey, getFullName(p.firstName, p.lastName, nameDisplay()));
      for (const o of store.appStore.allOrgs()) map.set(`org.${o.okey}`, o.name);
      return map;
    });
    const rowOf = (personKey: string): MailingRecipientRow => ({
      personKey,
      name: names().get(personKey) ?? (isOrgRecipient(personKey) ? personKey : store.i18n.unknown_person()),
    });
    return {
      mailings: computed(() => store.mailingsResource.value() ?? []),
      isLoading: computed(() => store.mailingsResource.isLoading()),
      mailing: computed(() => store.mailingResource.value()),
      isMailingLoading: computed(() => store.mailingResource.isLoading()),
      mailJob: computed(() => store.mailJobResource.value()),
      /** per delivery type, the recipients ticked for it, sorted by name */
      channels: computed(() => {
        const deliveries = store.mailingResource.value()?.deliveries;
        return MAILING_VIEW_CHANNELS.map((channel) => ({
          channel,
          rows: mailingRecipientsFor(deliveries, channel).map(rowOf).sort((a, b) => a.name.localeCompare(b.name)),
        }));
      }),
      events: computed<MailingEventRow[]>(() => {
        const mailing = store.mailingResource.value();
        const keys = mailing?.caleventKeys ?? [];
        const loaded = store.eventsResource.value() ?? [];
        const recipients = (mailing?.deliveries ?? []).map((d) => rowOf(d.personKey)).sort((a, b) => a.name.localeCompare(b.name));
        return keys.map((key, i) => {
          const event = loaded[i];
          const answers = recipients.map((r) => ({ ...r, answer: mailingAnswerOf(event?.attendees, event?.maxAttendees, r.personKey) }));
          return { key, event, answers, counts: mailingAnswerCounts(answers.map((a) => a.answer)) };
        });
      }),
    };
  }),
  withComputed((store) => ({
    filteredMailings: computed(() => {
      const term = store.searchTerm().trim();
      const all = store.mailings();
      if (!term) return all;
      return all.filter((m) => nameMatches(`${m.subject ?? ''} ${m.senderName ?? ''}`, term));
    }),
    /** personKey → the mail server's report for that recipient's E-Mail */
    deliveryByPerson: computed(() => deliveryByPerson(store.deliveries())),
    /** a sent Versand whose mail job or letters failed is only partly through */
    partlyFailed: computed(() => {
      const mailing = store.mailing();
      return mailing?.state === 'sent' && (store.mailJob()?.state === 'failed' || mailing.letters?.state === 'failed');
    }),
  })),
  withMethods((store) => ({
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setMailingKey(mailingKey: string): void {
      if (mailingKey === store.mailingKey()) return;
      patchState(store, {
        mailingKey, letters: undefined, lettersLoading: false, lettersError: false,
        deliveries: undefined, deliveriesLoading: false, deliveriesError: false,
      });
    },

    /**
     * Asks the server for the letters: a fresh download link while they are kept (7 days), or
     * `expired` after. The link is fetched before the click, so the browser opens it without a popup block.
     */
    /** Asks the server what the mail server reported for each E-Mail of the Versand. */
    async loadDeliveries(mailing: MailingView | undefined): Promise<void> {
      if (!mailing?.okey || !mailing.mailJobKey || store.deliveriesLoading()) return;
      patchState(store, { deliveriesLoading: true, deliveriesError: false });
      try {
        const deliveries = await store.docEmailService.getMailingDeliveries(mailing.okey);
        if (store.mailingKey() === mailing.okey) patchState(store, { deliveries });
      } catch (err) {
        console.error('MailingStore.loadDeliveries', err);
        patchState(store, { deliveriesError: true });
      } finally {
        patchState(store, { deliveriesLoading: false });
      }
    },

    async loadLetters(mailing: MailingView | undefined): Promise<void> {
      if (!mailing?.okey || !mailing.letters || store.lettersLoading()) return;
      patchState(store, { lettersLoading: true, lettersError: false });
      try {
        const letters = await store.docEmailService.getMailingLetters(mailing.okey);
        if (store.mailingKey() === mailing.okey) patchState(store, { letters });
      } catch (err) {
        console.error('MailingStore.loadLetters', err);
        patchState(store, { lettersError: true });
      } finally {
        patchState(store, { lettersLoading: false });
      }
    },
  })),
);
