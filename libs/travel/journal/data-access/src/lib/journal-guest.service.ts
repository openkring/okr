import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * The guest callables of the travel journal (spec 1.113 §7, plan 7): `manageJournalGuest` for the authors
 * (links: list, create, expiry, revoke) and `journalGuest` for the guest page, where the link code is the
 * only credential (view, comment, like, unlike, settings, mute, unmute).
 */
export interface GuestLinkView { personKey: string; url: string; expiresAt: string; revokedAt: string; mutedAt: string }

export type GuestChannel = 'email' | 'signal' | 'none';

export interface GuestPhotoView { key: string; width: number; height: number; latitude?: number; longitude?: number; takenAt?: string; url: string; thumb: string }
export interface GuestBlockView { key: string; kind: 'text' | 'photos'; authorName: string; html: string; photos: GuestPhotoView[] }
export interface GuestCommentView { key: string; authorName: string; text: string; createdAt: string; mine: boolean }
export interface GuestFootprintView {
  key: string; title: string; placeName: string; date: string; time: string; latitude?: number; longitude?: number;
  blocks: GuestBlockView[]; likes: number; liked: boolean; comments: GuestCommentView[];
}
export interface GuestJournalView {
  journal: { key: string; title: string; subTitle: string };
  me: { personKey: string; name: string; channel: GuestChannel; muted: boolean; expiresAt: string };
  footprints: GuestFootprintView[];
}

@Injectable({ providedIn: 'root' })
export class JournalGuestService {
  private call<T>(name: string, payload: unknown): Promise<T> {
    return httpsCallable<unknown, T>(getFunctions(getApp(), 'europe-west6'), name)(payload).then((r) => r.data);
  }

  // ---- authors ----
  public async links(journalKey: string): Promise<GuestLinkView[]> {
    return (await this.call<{ links: GuestLinkView[] }>('manageJournalGuest', { journalKey, action: 'list' })).links;
  }

  public async createLink(journalKey: string, personKey: string): Promise<GuestLinkView> {
    return (await this.call<{ link: GuestLinkView }>('manageJournalGuest', { journalKey, action: 'create', personKey })).link;
  }

  public async setExpiry(journalKey: string, personKey: string, expiresAt: string | null): Promise<GuestLinkView> {
    return (await this.call<{ link: GuestLinkView }>('manageJournalGuest', { journalKey, action: 'expiry', personKey, expiresAt })).link;
  }

  public async revoke(journalKey: string, personKey: string): Promise<GuestLinkView> {
    return (await this.call<{ link: GuestLinkView }>('manageJournalGuest', { journalKey, action: 'revoke', personKey })).link;
  }

  // ---- guests (link code) ----
  public view(journalKey: string, code: string): Promise<GuestJournalView> {
    return this.call<GuestJournalView>('journalGuest', { journalKey, code, action: 'view' });
  }

  public act(journalKey: string, code: string, action: 'comment' | 'like' | 'unlike' | 'settings' | 'mute' | 'unmute',
    extra: { footprintKey?: string; text?: string; channel?: GuestChannel } = {}): Promise<void> {
    return this.call<unknown>('journalGuest', { journalKey, code, action, ...extra }).then(() => undefined);
  }
}

/** The callable error code without the `functions/` prefix, e.g. `permission-denied`; the reason in its message. */
export function guestErrorOf(error: unknown): { code: string; message: string } {
  const e = error as { code?: unknown; message?: unknown } | undefined;
  return {
    code: typeof e?.code === 'string' ? e.code.replace(/^functions\//, '') : 'unknown',
    message: typeof e?.message === 'string' ? e.message : '',
  };
}
