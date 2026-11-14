import { Injector, Signal } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';

import { TripModel } from '@okr/shared-models';
import { fill } from '@okr/shared-util-core';
import { LocalSection, LocalTrack, TrackerI18n } from '@okr/mobility-tracker-util';
import { JournalOutboxOffline, JournalOutboxPeer, JournalOutboxService, OutboxPeerStatus } from '@okr/travel-journal-data-access';
import { OutboxJournal, preparedJournalsMessage, tripOfLocalTrack } from '@okr/travel-journal-util';

/**
 * «An Reisetagebuch senden» and «Für unterwegs vorbereiten» on the track detail page (spec 1.154 phase 5, decision 9).
 * LAZY: the page reaches this module only through `import('./track-journal-send')` on a tap (or after its first paint for
 * the author check), so the journal's data-access and util never enter the tracker's static graph (lazy-loading skill:
 * a static import is the binding edge).
 */
export interface TrackSendInput {
  injector: Injector;
  i18n: TrackerI18n;
  track: LocalTrack;
  sections: LocalSection[];
  distances: number[]; // per section, as the page shows them (timetable lines included)
  trip: TripModel | undefined; // the uploaded trip, when known
  isLocal: boolean; // the track is in TrackDb on this device (its photo list is the device's own)
  author: { personKey: string; name: string } | undefined; // the signed-in person (undefined after an offline cold start)
  tenantId: string;
}

/** The P2P sending session's status and its stop, for the page's note line. */
export interface TrackSendSession {
  status: Signal<OutboxPeerStatus>;
  stop: () => Promise<void>;
}

/**
 * Whether the person writes in at least one journal: the journals prepared or listed before (on this phone), else — when
 * online — the server's list. Never throws; false when it cannot tell.
 */
export async function isJournalAuthor(injector: Injector, author: TrackSendInput['author']): Promise<boolean> {
  const outbox = injector.get(JournalOutboxService);
  try {
    if (author) await outbox.bindAuthor(author);
    if ((await outbox.cachedJournals()).length > 0) return true;
    if (!author || !(await outbox.maybeOnline())) return false;
    return (await outbox.refreshJournals(author.personKey, false)).length > 0;
  } catch {
    return false;
  }
}

export function sendSession(injector: Injector): TrackSendSession {
  const peer = injector.get(JournalOutboxPeer);
  return { status: peer.status, stop: () => peer.stop() };
}

/**
 * Chooses a journal, builds the delivery (photos 2048/400 from this phone's library, the derived copy), then sends it:
 * online through Firestore, else — or when the network turns out to be a LAN without Internet — over the local network
 * to an iPad of the journal. Everything that has not arrived stays in the outbox.
 */
export async function sendTrackToJournal(input: TrackSendInput): Promise<void> {
  const { injector, i18n } = input;
  const outbox = injector.get(JournalOutboxService);
  const ui = uiOf(injector);
  if (input.author) await outbox.bindAuthor(input.author);
  const author = input.author ?? (await outbox.author());
  if (!author) {
    await ui.toast(i18n.journal_none_offline());
    return;
  }

  let online = await outbox.maybeOnline();
  let journals: OutboxJournal[] = [];
  if (online) {
    try {
      journals = await outbox.refreshJournals(author.personKey, false);
    } catch (error) {
      if (!(error instanceof JournalOutboxOffline)) console.error('track-journal-send: journals', error);
      online = false;
    }
  }
  if (!online) journals = (await outbox.cachedJournals()).filter((j) => j.secret !== '');
  if (journals.length === 0) {
    await ui.toast(online ? i18n.journal_none() : i18n.journal_none_offline());
    return;
  }
  const journal = await chooseJournal(ui.alerts, i18n, journals);
  if (!journal) return;

  const loading = await ui.loading(i18n.journal_preparing());
  let skipped = 0;
  try {
    const trip = input.isLocal || !input.trip
      ? tripOfLocalTrack(input.track, input.sections.map((s) => s.points), input.tenantId)
      : input.trip;
    const sections = input.sections.map((s, i) => ({ mode: s.mode, points: s.points, distanceM: input.distances[i] }));
    const result = await outbox.send({ journalKey: journal.journalKey, trip, sections, authorKey: author.personKey, online });
    if (result.state === 'inJournal') {
      await loading.dismiss();
      await ui.toast(i18n.journal_already());
      return;
    }
    if (result.state === 'pending') await ui.toast(i18n.journal_waiting());
    else skipped = result.skipped;
  } catch (error) {
    console.error('track-journal-send: building the delivery', error);
    await loading.dismiss();
    await ui.toast(i18n.journal_error());
    return;
  }

  if (online) {
    try {
      const { remaining } = await outbox.deliverOnline(input.tenantId, journal.journalKey);
      await loading.dismiss();
      if (remaining === 0) {
        await ui.toast(withSkipped(i18n.journal_sent(), skipped, i18n));
        return;
      }
      // records are through, a photo upload failed: the iPads in reach can still take the files
    } catch (error) {
      if (!(error instanceof JournalOutboxOffline)) {
        console.error('track-journal-send: online delivery', error);
        await loading.dismiss();
        await ui.toast(i18n.journal_error());
        return;
      }
    }
  }
  await loading.dismiss();
  await startPeer(input, journal, skipped, ui);
}

/**
 * «Für unterwegs vorbereiten» (online): lists the person's journals and fetches their peer secrets, so the phone can send
 * offline; deliveries still waiting go out on the way. Shows which journals are ready.
 */
export async function prepareJournalsForTravel(input: Pick<TrackSendInput, 'injector' | 'i18n' | 'author' | 'tenantId'>): Promise<void> {
  const { injector, i18n, author } = input;
  const outbox = injector.get(JournalOutboxService);
  const ui = uiOf(injector);
  if (!author || !(await outbox.maybeOnline())) {
    await ui.toast(i18n.journal_prepare_offline());
    return;
  }
  const loading = await ui.loading(i18n.journal_preparing_journals());
  let journals: OutboxJournal[];
  try {
    await outbox.bindAuthor(author);
    journals = await outbox.refreshJournals(author.personKey, true);
    await outbox.deliverOnline(input.tenantId).catch((error: unknown) => console.warn('track-journal-send: waiting deliveries', error));
  } catch (error) {
    await loading.dismiss();
    await ui.toast(error instanceof JournalOutboxOffline ? i18n.journal_prepare_offline() : i18n.journal_error());
    return;
  }
  await loading.dismiss();
  if (journals.length === 0) {
    await ui.toast(i18n.journal_none());
    return;
  }
  const waiting = outbox.pending().length;
  const alert = await ui.alerts.create({
    header: i18n.journal_prepare_title(),
    message: preparedJournalsMessage(journals, {
      untitled: i18n.journal_untitled(), ready: i18n.journal_ready(), notReady: i18n.journal_not_ready(), hint: i18n.journal_prepare_hint(),
      waiting: waiting > 0 ? fill(i18n.journal_waiting_count(), { count: String(waiting) }) : '',
    }),
    buttons: [{ text: i18n.journal_ok(), role: 'cancel' }],
  });
  await alert.present();
}

// ------------------------------------------------------------------ internals

interface Ui {
  alerts: AlertController;
  toast: (message: string) => Promise<void>;
  loading: (message: string) => Promise<{ dismiss: () => Promise<unknown> }>;
}

function uiOf(injector: Injector): Ui {
  const toasts = injector.get(ToastController);
  const loadings = injector.get(LoadingController);
  return {
    alerts: injector.get(AlertController),
    toast: async (message) => {
      const toast = await toasts.create({ message, duration: 4000 });
      await toast.present();
    },
    loading: async (message) => {
      const loading = await loadings.create({ message });
      await loading.present();
      return loading;
    },
  };
}

function withSkipped(message: string, skipped: number, i18n: TrackerI18n): string {
  return skipped > 0 ? `${message} ${fill(i18n.journal_photos_skipped(), { count: String(skipped) })}` : message;
}

async function chooseJournal(alerts: AlertController, i18n: TrackerI18n, journals: OutboxJournal[]): Promise<OutboxJournal | undefined> {
  const alert = await alerts.create({
    header: i18n.journal_choose_title(),
    inputs: journals.map((j, i) => ({ type: 'radio' as const, label: j.title || i18n.journal_untitled(), value: j.journalKey, checked: i === 0 })),
    buttons: [
      { text: i18n.common_cancel(), role: 'cancel' },
      { text: i18n.journal_choose_send(), role: 'confirm' },
    ],
  });
  await alert.present();
  const { data, role } = await alert.onWillDismiss<{ values?: string }>();
  return role === 'confirm' ? journals.find((j) => j.journalKey === data?.values) : undefined;
}

async function startPeer(input: TrackSendInput, journal: OutboxJournal, skipped: number, ui: Ui): Promise<void> {
  const { i18n } = input;
  const peer = input.injector.get(JournalOutboxPeer);
  try {
    await peer.start(journal.journalKey, input.author?.name || 'iPhone');
  } catch (error) {
    console.error('track-journal-send: P2P start', error);
    await ui.toast(i18n.journal_stopped());
    return;
  }
  const state = peer.status().state;
  if (state === 'noSecret') await ui.toast(i18n.journal_no_secret());
  else if (state === 'busy') await ui.toast(i18n.journal_busy());
  else if (state === 'done') await ui.toast(withSkipped(i18n.journal_sent(), skipped, i18n));
  else if (skipped > 0) await ui.toast(fill(i18n.journal_photos_skipped(), { count: String(skipped) }));
}
