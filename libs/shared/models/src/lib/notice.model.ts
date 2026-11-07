import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** A file attached to a notice. It lives in Storage and is opened through `getNoticeAttachment` only. */
export interface NoticeAttachment {
  filename: string;
  storagePath: string;
  contentType: string;
}

/**
 * A Mitteilung (spec 1.145 §10): the In-App delivery of a Versand, listed on the dashboard of every
 * recipient. Written only by the `onMailing` Cloud Function; a client never writes one.
 *
 * Readable by its recipients (`callerPersonKey() in recipients`) and by memberAdmin / privileged of
 * the tenant. `recipients` holds personKeys, so a person who belongs to several tenants finds the
 * notice in a query over all of them: the reader filters by `tenants` on the client.
 */
export class NoticeModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;   // exactly one tenant
  public isArchived = false;

  public subject = '';
  /** The message body as HTML, sanitised on the server. */
  public body = '';
  public attachments: NoticeAttachment[] = [];
  /** personKeys of the persons the notice was sent to. */
  public recipients: string[] = [];
  /** personKey and display name of the sender. */
  public senderKey = '';
  public senderName = '';
  /** FK -> mailings (the Versand this notice belongs to). */
  public mailingKey = '';
  /** StoreDateTime (yyyyMMddHHmmss) */
  public sentAt = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const NoticeCollection = 'notices';
export const NoticeModelName = 'notice';
