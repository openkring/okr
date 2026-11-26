import { Injectable } from '@angular/core';
import { SectionFeedback, TransportMode } from '@okr/shared-models';
import { JournalSectionType, ReactionSummary, TrackCopy, TrackCopyPhoto } from '@okr/travel-journal-util';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { activeFirebaseApp } from '@okr/shared-config';

/**
 * The guest callables of the travel journal (spec 1.113 §7, plan 7): `manageJournalGuest` for the authors
 * (links: list, create, expiry, revoke; notices; people, hasEmail) and `journalGuest` for the guest page, where the link code is the
 * only credential (view, comment, deleteComment, react, unreact, settings, mute, unmute; like/unlike for old pages only).
 */
export interface GuestLinkView { personKey: string; url: string; expiresAt: string; revokedAt: string; mutedAt: string }

export type GuestChannel = 'email' | 'none';

/** An author's or guest's email as the journal's authors see it (spec 1.154 §9); '' when the person has none. */
export interface JournalPersonEmail { personKey: string; email: string }

export interface NoticePreview {
  subject: string;
  text: string;
  recipients: { email: number; none: number; muted: number };
}

export interface GuestPhotoView { key: string; width: number; height: number; latitude?: number; longitude?: number; takenAt?: string; url: string; thumb: string }
export interface GuestVideoView { key: string; width: number; height: number; durationSec: number; poster: string; url: string }
export interface GuestCommentView { key: string; authorName: string; text: string; createdAt: string; mine: boolean }
/** The comments and reaction chips of one section or image; empty while its switch is off. */
export interface GuestFeedbackView { reactions: ReactionSummary[]; comments: GuestCommentView[] }
/** A track photo as a guest receives it: its position and time from the track copy, signed URLs of the journal image. */
export interface GuestTrackPhotoView extends TrackCopyPhoto { url: string; thumb: string }
/**
 * The track of a track section (spec 1.154 phase 5): the allow-listed copy without the trip key — sections with the
 * encoded points (`trackPointsOf` decodes them) — and only photos of live journal images, signed. No activity metrics.
 */
export type GuestTrackView = Omit<TrackCopy, 'tripKey' | 'photos'> & { photos: GuestTrackPhotoView[] };
/**
 * A section of a published footprint as a guest receives it (spec 1.154 phase 2): the CMS type, title, html and
 * properties (image references name journal images in `ImageConfig.label`, their `url` is empty) plus the signed
 * photos (`sectionImageKeys` order) and clips (`sectionClipKeys` order). No person data beyond the author's name.
 * Phase 4: the switches in effect (`feedback`), the section's own reactions and comments, and per journal image key
 * (`images`, only while an image switch is on) the image's. Absent from a server older than phase 4.
 */
export interface GuestSectionView extends Partial<GuestFeedbackView> {
  key: string; type: JournalSectionType; title: string; html: string; properties: Record<string, unknown>;
  authorName: string; photos: GuestPhotoView[]; videos: GuestVideoView[];
  feedback?: SectionFeedback; images?: Record<string, GuestFeedbackView>;
  /** a track section whose track is there and live (phase 5); absent otherwise and from an older server */
  track?: GuestTrackView;
}
export interface GuestFootprintView {
  key: string; title: string; placeName: string; date: string; time: string; latitude?: number; longitude?: number;
  weather?: { code: number; min: number; max: number; precip: number; sunrise?: string; sunset?: string };
  transport?: TransportMode;
  /** absent from a server older than 1.154 (it sent `blocks`): read as `[]` */
  sections?: GuestSectionView[]; likes: number; liked: boolean; comments: GuestCommentView[];
}
export interface GuestJournalView {
  /** startDate: StoreDate or '' (absent from an older server) — the first day of the trip for «Tag N» */
  journal: { key: string; title: string; subTitle: string; startDate?: string };
  me: { personKey: string; name: string; channel: GuestChannel; muted: boolean; expiresAt: string };
  footprints: GuestFootprintView[];
  /**
   * The journal route as [lat, lng] in time order (phase 5, decision 5): photo positions of published footprints only,
   * at most 2,000 points. Sent once, only when a map section has `properties.showRoute`; absent from an older server.
   */
  route?: [number, number][];
}

@Injectable({ providedIn: 'root' })
export class JournalGuestService {
  private call<T>(name: string, payload: unknown): Promise<T> {
    return httpsCallable<unknown, T>(getFunctions(activeFirebaseApp(), 'europe-west6'), name)(payload).then((r) => r.data);
  }

  // ---- authors ----
  public async links(journalKey: string): Promise<GuestLinkView[]> {
    return (await this.call<{ links: GuestLinkView[] }>('manageJournalGuest', { journalKey, action: 'list' })).links;
  }

  /**
   * Creates (or reuses) the person's guest link. `email`, when given, is stored for a person who has none yet
   * (an existing address is kept); a malformed one is refused with `invalid-argument` before anything is written.
   */
  public async createLink(journalKey: string, personKey: string, email?: string): Promise<GuestLinkView> {
    const payload = email === undefined ? { journalKey, action: 'create', personKey } : { journalKey, action: 'create', personKey, email };
    return (await this.call<{ link: GuestLinkView }>('manageJournalGuest', payload)).link;
  }

  public async setExpiry(journalKey: string, personKey: string, expiresAt: string | null): Promise<GuestLinkView> {
    return (await this.call<{ link: GuestLinkView }>('manageJournalGuest', { journalKey, action: 'expiry', personKey, expiresAt })).link;
  }

  public async revoke(journalKey: string, personKey: string): Promise<GuestLinkView> {
    return (await this.call<{ link: GuestLinkView }>('manageJournalGuest', { journalKey, action: 'revoke', personKey })).link;
  }

  /** What changed since the last notice, the proposed text and who would receive it (plan 8). */
  public previewNotice(journalKey: string): Promise<NoticePreview> {
    return this.call<NoticePreview>('manageJournalGuest', { journalKey, action: 'previewNotice' });
  }

  public async sendNotice(journalKey: string, subject: string, text: string): Promise<{ email: number }> {
    return (await this.call<{ sent: { email: number } }>('manageJournalGuest', { journalKey, action: 'sendNotice', subject, text })).sent;
  }

  /** The email of every author and guest of the journal, '' when a person has none (spec 1.154 §9; authors only). */
  public async people(journalKey: string): Promise<JournalPersonEmail[]> {
    return (await this.call<{ people: JournalPersonEmail[] }>('manageJournalGuest', { journalKey, action: 'people' })).people;
  }

  /** Whether a person of the tenant has an email (the address itself is never returned); for a guest about to be added. */
  public async hasEmail(journalKey: string, personKey: string): Promise<boolean> {
    return (await this.call<{ hasEmail: boolean }>('manageJournalGuest', { journalKey, action: 'hasEmail', personKey })).hasEmail;
  }

  // ---- guests (link code) ----
  public view(journalKey: string, code: string): Promise<GuestJournalView> {
    return this.call<GuestJournalView>('journalGuest', { journalKey, code, action: 'view' });
  }

  /**
   * A guest action. `comment` takes `parentKey` (`section.<key>` / `image.<key>`) and `text`; `react`/`unreact` take
   * `parentKey` and `emoji`; the server finds the footprint and refuses a parent whose switch is off. `footprintKey` only
   * for the old `like`/`unlike`/footprint `comment`.
   */
  public act(journalKey: string, code: string, action: 'comment' | 'deleteComment' | 'react' | 'unreact' | 'like' | 'unlike' | 'settings' | 'mute' | 'unmute',
    extra: { footprintKey?: string; parentKey?: string; emoji?: string; commentKey?: string; text?: string; channel?: GuestChannel } = {}): Promise<void> {
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
