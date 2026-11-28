// libs/content/pdf-template/feature/src/lib/mailing.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, of } from 'rxjs';

import { ModalController } from '@ionic/angular';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore, PersonSelectModal, type PersonSelectResult } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CalEventModel, NameDisplay } from '@okr/shared-models';
import { DocEmailService, MailingLetters, MailingService, SendingService } from '@okr/content-pdf-template-data-access';
import {
  deliveryByPerson, MAILING_I18N_KEYS, MAILING_VIEW_CHANNELS, MailingAnswer, mailingAnswerCounts, mailingAnswerOf, MailingDeliveries,
  MailingI18n, mailingRecipientsFor, MailingView, recipientPersonKey, SENDING_I18N_KEYS, SendingI18n, summarizeSendings,
} from '@okr/content-pdf-template-util';
import { getFullName, isHouseholdRecipient, isOrgRecipient, nameMatches } from '@okr/shared-util-core';

/** One recipient row of the detail view: a name, never an address (privacy-model skill). */
export interface MailingRecipientRow {
  personKey: string;
  name: string;
  /** a `household.<okey>` row (spec 1.168): no avatar, no person page */
  household?: boolean;
  /** the person whose answer and In-App read state the row shows (a household's contact); undefined = unknown */
  readKey?: string;
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
    sendingI18n: inject(I18nService).translateAll(SENDING_I18N_KEYS) as SendingI18n,
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    firestoreService: inject(FirestoreService),
    mailingService: inject(MailingService),
    docEmailService: inject(DocEmailService),
    sendingService: inject(SendingService),
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
    /** the letters of a Pingen Versand, live (spec 1.150 §9); only asked for when the Versand goes through Pingen */
    sendingsResource: rxResource({
      // a string, so the live mailing doc re-emitting does not re-subscribe the letters' listener
      params: () => {
        const tenantId = store.appStore.tenantId();
        return store.mailingResource.value()?.post?.via === 'pingen' && tenantId ? `${tenantId}|${store.mailingKey()}` : undefined;
      },
      stream: ({ params }) => {
        const [tenantId, key] = params.split('|');
        return store.sendingService.listForMailing(tenantId, key);
      },
    }),
    mailJobResource: rxResource({
      params: () => {
        const key = store.mailingResource.value()?.mailJobKey;
        return key ? { key } : undefined;
      },
      stream: ({ params }) => store.docEmailService.mailJob(params.key),
    }),
    /** who opened the In-App Mitteilung, live (personKey → readAt) */
    noticeReadsResource: rxResource({
      params: () => store.mailingResource.value()?.noticeKey || undefined,
      stream: ({ params }) => store.mailingService.noticeReads(params),
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
    /** a household row's name: as the send recorded it, else from its letter's record, else «Haushalt» */
    const householdName = (key: string): string => store.mailingResource.value()?.householdNames?.[key]
      || (store.sendingsResource.value() ?? []).find((s) => s.recipientKey === key)?.recipientName
      || store.i18n.household();
    const rowOf = (personKey: string): MailingRecipientRow => {
      const readKey = recipientPersonKey(personKey, store.mailingResource.value()?.householdContacts);
      if (isHouseholdRecipient(personKey)) return { personKey, name: householdName(personKey), household: true, ...(readKey ? { readKey } : {}) };
      return { personKey, readKey: personKey, name: names().get(personKey) ?? (isOrgRecipient(personKey) ? personKey : store.i18n.unknown_person()) };
    };
    return {
      mailings: computed(() => store.mailingsResource.value() ?? []),
      isLoading: computed(() => store.mailingsResource.isLoading()),
      mailing: computed(() => store.mailingResource.value()),
      isMailingLoading: computed(() => store.mailingResource.isLoading()),
      mailJob: computed(() => store.mailJobResource.value()),
      noticeReads: computed(() => store.noticeReadsResource.value() ?? new Map<string, string>()),
      sendings: computed(() => store.sendingsResource.value() ?? []),
      sendingsLoading: computed(() => store.sendingsResource.isLoading()),
      /** a Versand sent through Pingen shows the «Briefe» card */
      isPingen: computed(() => store.mailingResource.value()?.post?.via === 'pingen'),
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
          // a household answers through its contact (spec 1.168); an unknown contact stays open
          const answers = recipients.map((r) => ({ ...r, answer: mailingAnswerOf(event?.attendees, event?.maxAttendees, r.readKey ?? '') }));
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
    sendingSummary: computed(() => summarizeSendings(store.sendingsResource.value() ?? [])),
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

    /**
     * «Neuen Versand erstellen» of the overview: the recipients are picked first (persons, with group filter and select-all, as
     * «Versenden» of a news article does), then the usual Versand opens with them. Nothing happens if the picker is closed or
     * nobody is checked. The composer and its editor are loaded only now, never with the list.
     */
    async newVersand(): Promise<void> {
      const currentUser = store.appStore.currentUser();
      if (!currentUser) return;
      const picker = await store.modalController.create({
        component: PersonSelectModal,
        componentProps: { selectedTag: '', currentUser, multiple: true },
        cssClass: 'modal-fixed-height',
      });
      await picker.present();
      const { data, role } = await picker.onWillDismiss<PersonSelectResult>();
      if (role !== 'confirm' || data?.kind !== 'multi' || data.persons.length === 0) return;
      const { openBulkEmailFlow, toVersandRecipients } = await import('./bulk-email');
      const recipients = toVersandRecipients(data.persons, (p) => store.appStore.getDirectoryEntry(`person.${p.okey}`)?.favEmail);
      await openBulkEmailFlow({
        modalController: store.modalController,
        firestoreService: store.firestoreService,
        appStore: store.appStore,
        tenantId: store.appStore.tenantId(),
      }, recipients);
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
