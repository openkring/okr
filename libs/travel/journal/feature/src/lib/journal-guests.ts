import { inject, Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { ActionSheetController, ModalController, ToastController } from '@ionic/angular';

import { AvatarInfo } from '@okr/shared-models';
import { ModelSelectService } from '@okr/shared-feature';
import { fill } from '@okr/shared-util-core';
import { GuestLinkView, guestErrorOf, JournalGuestService } from '@okr/travel-journal-data-access';
import { NoticeModal } from '@okr/travel-journal-ui';
import { NoticeFormModel } from '@okr/travel-journal-util';

import { showJournalError } from './journal-errors';
import { JournalStore } from './journal.store';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The «Gäste» sheet of a journal (spec 1.113 §7, plan 7): add a guest (person picker), share the personal
 * link, set how long it works, block access, remove. Online only — the links live behind a callable.
 */
@Injectable({ providedIn: 'root' })
export class JournalGuestsSheet {
  private readonly store = inject(JournalStore);
  private readonly guestService = inject(JournalGuestService);
  private readonly modelSelectService = inject(ModelSelectService);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);

  /**
   * «Gäste benachrichtigen» (plan 8): the server collects what changed since the last notice and proposes a
   * text; the author may change it and sends it. Nothing goes out automatically.
   */
  public async notify(journalKey: string): Promise<void> {
    const i18n = this.store.i18n;
    if (!(await Network.getStatus()).connected) {
      await this.toast(i18n.notice_offline());
      return;
    }
    try {
      const preview = await this.guestService.previewNotice(journalKey);
      const reachable = preview.recipients.email + preview.recipients.signal;
      if (reachable === 0) {
        await this.toast(i18n.notice_no_guests());
        return;
      }
      const recipients = [fill(i18n.notice_recipients(), { email: preview.recipients.email, signal: preview.recipients.signal }),
        preview.recipients.muted > 0 ? fill(i18n.notice_muted(), { muted: preview.recipients.muted }) : ''].filter((x) => x).join(' ');
      const modal = await this.modalController.create({
        component: NoticeModal, componentProps: { notice: { subject: preview.subject, text: preview.text }, recipients },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<NoticeFormModel>();
      if (role !== 'confirm' || !data) return;
      const sent = await this.guestService.sendNotice(journalKey, data.subject, data.text);
      await this.toast(fill(i18n.notice_sent(), { count: sent.email + sent.signal }));
    } catch (error) {
      await showJournalError(this.toastController, i18n, error);
    }
  }

  public async open(journalKey: string): Promise<void> {
    const i18n = this.store.i18n;
    if (!(await Network.getStatus()).connected) {
      await this.toast(i18n.guest_offline());
      return;
    }
    try {
      const links = new Map((await this.guestService.links(journalKey)).filter((l) => !l.revokedAt).map((l) => [l.personKey, l]));
      const guests = this.store.guests(journalKey);
      // a live link of a person who is no longer on the guest list stays visible, so it can still be blocked
      for (const personKey of links.keys()) {
        if (!guests.some((g) => g.key === personKey)) {
          guests.push({ key: personKey, name1: personKey, name2: '', modelType: 'person', type: '', subType: '', label: personKey });
        }
      }
      const sheet = await this.actionSheetController.create({
        header: i18n.guests_title(),
        buttons: [
          ...guests.map((guest) => ({ text: `${this.nameOf(guest)} · ${this.stateOf(links.get(guest.key))}`, handler: () => void this.guestActions(journalKey, guest) })),
          { text: i18n.guest_add(), handler: () => void this.add(journalKey) },
          { text: i18n.cancel(), role: 'cancel' },
        ],
      });
      await sheet.present();
    } catch (error) {
      await showJournalError(this.toastController, i18n, error);
    }
  }

  private nameOf(person: AvatarInfo): string {
    return `${person.name1} ${person.name2}`.trim() || person.label;
  }

  private stateOf(link: GuestLinkView | undefined): string {
    const i18n = this.store.i18n;
    if (!link) return i18n.guest_state_none();
    const parts = [link.expiresAt
      ? fill(i18n.guest_state_expires(), { date: link.expiresAt.slice(0, 10).split('-').reverse().join('.') })
      : i18n.guest_state_ok()];
    if (link.mutedAt) parts.push(i18n.guest_state_muted());
    return parts.join(', ');
  }

  private async add(journalKey: string): Promise<void> {
    const person = await this.modelSelectService.selectPersonAvatar();
    if (!person?.key) return; // cancelled, or a free-text name without a person
    try {
      await this.store.addGuest(journalKey, person);
      await this.share(journalKey, person);
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
    }
  }

  private async guestActions(journalKey: string, guest: AvatarInfo): Promise<void> {
    const i18n = this.store.i18n;
    const sheet = await this.actionSheetController.create({
      header: this.nameOf(guest),
      buttons: [
        { text: i18n.guest_share(), handler: () => void this.share(journalKey, guest) },
        { text: i18n.guest_expiry(), handler: () => void this.expiry(journalKey, guest) },
        { text: i18n.guest_revoke(), role: 'destructive', handler: () => void this.confirmRevoke(journalKey, guest, false) },
        { text: i18n.guest_remove(), role: 'destructive', handler: () => void this.confirmRevoke(journalKey, guest, true) },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** The personal link (created on first use) through the share sheet: Messages, Mail, Signal, AirDrop … */
  private async share(journalKey: string, guest: AvatarInfo): Promise<void> {
    try {
      const link = await this.guestService.createLink(journalKey, guest.key);
      await Share.share({ title: this.nameOf(guest), text: fill(this.store.i18n.guest_share_text(), { url: link.url }), url: link.url });
    } catch (error) {
      if (String((error as Error)?.message ?? '').toLowerCase().includes('cancel')) return; // share sheet closed
      await showJournalError(this.toastController, this.store.i18n, error);
    }
  }

  private async expiry(journalKey: string, guest: AvatarInfo): Promise<void> {
    const i18n = this.store.i18n;
    const set = (days: number | null) => async () => {
      try {
        await this.guestService.createLink(journalKey, guest.key); // a link must exist before it can expire
        await this.guestService.setExpiry(journalKey, guest.key, days === null ? null : new Date(Date.now() + days * DAY_MS).toISOString());
      } catch (error) {
        await showJournalError(this.toastController, i18n, error);
      }
    };
    const sheet = await this.actionSheetController.create({
      header: i18n.guest_expiry_title(),
      buttons: [
        { text: i18n.guest_expiry_1m(), handler: () => void set(31)() },
        { text: i18n.guest_expiry_3m(), handler: () => void set(92)() },
        { text: i18n.guest_expiry_1y(), handler: () => void set(366)() },
        { text: i18n.guest_expiry_none(), handler: () => void set(null)() },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmRevoke(journalKey: string, guest: AvatarInfo, remove: boolean): Promise<void> {
    const i18n = this.store.i18n;
    const sheet = await this.actionSheetController.create({
      header: fill(i18n.guest_revoke_confirm(), { name: this.nameOf(guest) }),
      buttons: [
        {
          text: remove ? i18n.guest_remove() : i18n.guest_revoke(), role: 'destructive',
          handler: () => void (async () => {
            try {
              try {
                await this.guestService.revoke(journalKey, guest.key);
              } catch (error) {
                // only «no live link» means there is nothing to block; anything else must not look like success
                if (guestErrorOf(error).code !== 'not-found') throw error;
              }
              if (remove) await this.store.removeGuest(journalKey, guest.key);
            } catch (error) {
              await showJournalError(this.toastController, i18n, error);
            }
          })(),
        },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
