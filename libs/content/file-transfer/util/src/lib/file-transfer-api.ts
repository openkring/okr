/** Wire types shared by the Cloud Functions and the client (spec 1.115). */
export interface PrepareFileTransferUploadRequest {
  files: { name: string; size: number; contentType: string }[];
  lifetimeDays: number;
  externalCount: number;
  recipientCount: number;
  emails: string[];
  origin: string;
}
export interface PrepareFileTransferUploadResponse {
  transferKey: string;
  uploads: { index: number; sessionUrl: string; size: number }[];
}
export interface SendFileTransferRequest {
  transferKey: string;
  groupKeys: string[];
  personKeys: string[];
  emails: string[];
  message: string;
  password: string;
  chatRoomId: string;
}
export interface SendFileTransferResponse {
  recipients: number;
  notified: number;
}
export interface FileTransferView {
  transferKey: string;
  senderName: string;
  message: string;
  expiresAt: string;
  needsPassword: boolean;
  files: { index: number; name: string; size: number; contentType: string }[];
}
export type AccessFailure = 'notFound' | 'expired' | 'wrongPassword' | 'rateLimited';
