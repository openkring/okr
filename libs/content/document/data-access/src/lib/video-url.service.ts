import { Injectable, signal } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { mergeSigned, missingKeys, settleKeys, SignedVideo } from '@okr/content-document-util';

type Req = { docKeys: string[]; download?: boolean };
type Res = { videos: SignedVideo[]; expires: number };

/**
 * Album videos live in the private bucket (spec 1.82). The client never reads them directly:
 * `signVideoUrls` checks access and returns signed URLs valid for a fixed window. This service is
 * the only caller; it keeps one window's signatures and re-signs when the window runs out.
 */
@Injectable({ providedIn: 'root' })
export class VideoUrlService {
  private readonly _signed = signal<Record<string, SignedVideo>>({});
  private readonly _expires = signal<number | undefined>(undefined);
  /** End of the current signing window (epoch ms), undefined before the first answer. */
  public readonly expires = this._expires.asReadonly();
  public readonly signed = this._signed.asReadonly();
  private readonly _settled = signal<ReadonlySet<string>>(new Set());
  /** Keys an ensure() call has answered (signed or not) in the current window: absent from `signed` but in here = not available. */
  public readonly settled = this._settled.asReadonly();

  private call(req: Req): Promise<Res> {
    const fn = httpsCallable<Req, Res>(getFunctions(getApp(), 'europe-west6'), 'signVideoUrls');
    return fn(req).then(r => r.data);
  }

  /** Make sure posters/playback URLs for these keys are signed and fresh. Absent keys = not available. */
  public async ensure(keys: string[]): Promise<void> {
    const todo = missingKeys(keys, this._signed(), this._expires(), Date.now());
    if (todo.length === 0) return;
    let res: Res;
    try {
      res = await this.call({ docKeys: todo });
    } catch (ex) {
      // Settle on failure too, so the tile turns "not available" instead of loading forever.
      this._settled.set(settleKeys(this._settled(), todo, false));
      throw ex;
    }
    // Merge against the LIVE state: overlapping calls must not overwrite each other.
    const next = mergeSigned(this._signed(), this._expires(), res.videos, res.expires);
    const newWindow = next.expires !== this._expires();
    this._expires.set(next.expires);
    this._signed.set(next.signed);
    this._settled.set(settleKeys(this._settled(), todo, newWindow));
  }

  /** Fresh URLs incl. the original's download URL, for the player. */
  public async forPlayback(key: string): Promise<SignedVideo | undefined> {
    const res = await this.call({ docKeys: [key], download: true });
    return res.videos[0];
  }

  /** Download URLs of several originals, for the zip download. */
  public async forDownload(keys: string[]): Promise<SignedVideo[]> {
    if (keys.length === 0) return [];
    return (await this.call({ docKeys: keys, download: true })).videos;
  }
}
