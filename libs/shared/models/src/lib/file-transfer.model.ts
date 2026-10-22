import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/** Lebenszyklus einer Dateiübertragung (Spec 1.115). Nicht zu verwechseln mit TransferModel (Eigentumsübertragung). */
export type FileTransferState = 'uploading' | 'open' | 'ended' | 'expired';
export type FileTransferRecipientKind = 'person' | 'email';
export type FileTransferEventType = 'created' | 'sent' | 'opened' | 'downloaded' | 'ended' | 'expired' | 'limitRequested';

export interface FileTransferFile {
  index: number;
  name: string;
  size: number;
  contentType: string;
  path: string;
  uploaded: boolean;
}

export interface FileTransferRecipient {
  id: string;                 // stable within the transfer: 'p:<personKey>' | 'e:<lowercased email>'
  kind: FileTransferRecipientKind;
  personKey: string;          // '' for kind 'email'
  email: string;              // '' if the person is notified by chat only
  name: string;
  tokenHash: string;          // sha256(base64url token); the token itself is never stored
  aliasUrl: string;           // short personal link
  viaGroupKeys: string[];     // groups that brought this person in
}

/** Schnellübertragung von Dateien (planning/specs/2026-10-22-learning-media-sharing-spec.md). */
export class FileTransferModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public senderKey = '';                     // personKey
  public senderName = '';
  public message = '';
  public files: FileTransferFile[] = [];
  public totalBytes = 0;
  public groupKeys: string[] = [];
  public chatRoomId = '';                    // room that receives the card ('' = none)
  public recipients: FileTransferRecipient[] = [];
  public recipientPersonKeys: string[] = []; // denormalised for rules + membership checks
  public tokenHashes: string[] = [];         // denormalised for the public lookup
  public passwordHash = '';                  // scrypt 'salt:hash', '' = none
  public createdAt = '';                     // StoreDateTime
  public expiresAt = '';                     // ISO timestamp (UTC)
  public state: FileTransferState = 'uploading';
  public endedBy = '';                       // personKey of sender/admin who ended it early

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const FileTransferCollection = 'file-transfers';
export const FileTransferModelName = 'file-transfer';

export class FileTransferEventModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;

  public transferKey = '';
  public senderKey = '';      // personKey of the transfer's sender, denormalised so rules let senders read their own events
  public type: FileTransferEventType = 'opened';
  public recipientId = '';    // FileTransferRecipient.id or '' (sender/system)
  public actorKey = '';       // personKey of a logged-in actor, '' for link holders
  public fileIndex = -1;
  public at = '';             // ISO timestamp

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const FileTransferEventCollection = 'file-transfer-events';

export interface FileTransferLimitOverride {
  personKey: string;
  name: string;
  maxFileTransferBytes: number;
  maxOpenBytes: number;
}

export interface FileTransferLimits {
  maxFileTransferBytes: number;
  maxOpenBytes: number;
  overrideCeilingBytes: number;
  defaultLifetimeDays: number;
  maxLifetimeDays: number;
  maxExternalRecipients: number;
  overrides: FileTransferLimitOverride[];
}
