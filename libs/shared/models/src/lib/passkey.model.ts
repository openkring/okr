/**
 * A WebAuthn credential (passkey) registered for a user (spec 1.120).
 * Server-only: the `passkeys` collection is written and read by Cloud Functions only.
 */
export class PasskeyModel {
  public okey = ''; // base64url credential id = document id
  public uid = ''; // users/{uid}
  public tenants: string[] = [];
  public rpId = '';
  public publicKey = ''; // base64url COSE key
  public counter = 0;
  public transports: string[] = [];
  public aaguid = '';
  public backedUp = false;
  public label = '';
  public createdAt = ''; // StoreDateTime
  public lastUsedAt = ''; // StoreDateTime, '' = never
}

export const PasskeyCollection = 'passkeys';
export const PasskeyModelName = 'passkey';
export const WebauthnChallengeCollection = 'webauthn-challenges';

/** What the client sees — never the public key or counter. */
export type PasskeyItem = Pick<PasskeyModel, 'okey' | 'label' | 'createdAt' | 'lastUsedAt' | 'backedUp'>;
