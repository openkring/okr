import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

import { ENV } from '@okr/shared-config';
import { PasskeyItem } from '@okr/shared-models';

type OptionsResult<T> = { challengeId: string; options: T };

/**
 * Client side of the `passkey` callable (spec 1.120 phase 1). Passkeys are hidden on the native
 * shells for now: the WebView has no stable rpId/origin for them.
 */
@Injectable({ providedIn: 'root' })
export class PasskeyService {
  private readonly env = inject(ENV);

  /** Can this browser offer "sign in with passkey"? */
  public canSignIn(): boolean {
    return !Capacitor.isNativePlatform() && browserSupportsWebAuthn();
  }

  /** Can this device create a passkey (a platform authenticator is present)? */
  public async canRegister(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) return false;
    try {
      return await platformAuthenticatorIsAvailable();
    } catch {
      return false;
    }
  }

  /** Run the assertion ceremony and return a Firebase custom token for signInWithCustomToken. */
  public async getLoginToken(): Promise<string> {
    const { challengeId, options } = await this.call<OptionsResult<PublicKeyCredentialRequestOptionsJSON>>('loginOptions', this.rp());
    const response = await startAuthentication({ optionsJSON: options });
    const { token } = await this.call<{ token: string }>('loginVerify', { tenantId: this.env.tenantId, challengeId, response });
    return token;
  }

  /** Create a passkey for the signed-in user on this device. */
  public async register(): Promise<PasskeyItem> {
    const { challengeId, options } = await this.call<OptionsResult<PublicKeyCredentialCreationOptionsJSON>>('registerOptions', this.rp());
    const response = await startRegistration({ optionsJSON: options });
    const { item } = await this.call<{ item: PasskeyItem }>('registerVerify', { tenantId: this.env.tenantId, challengeId, response });
    return item;
  }

  public async list(uid: string): Promise<PasskeyItem[]> {
    return (await this.call<{ items: PasskeyItem[] }>('list', { uid })).items;
  }

  public async rename(okey: string, label: string): Promise<PasskeyItem> {
    return (await this.call<{ item: PasskeyItem }>('rename', { okey, label })).item;
  }

  public async remove(okey: string): Promise<void> {
    await this.call<{ ok: true }>('delete', { okey });
  }

  private rp(): { tenantId: string; rpId: string; origin: string } {
    return { tenantId: this.env.tenantId, rpId: location.hostname, origin: location.origin };
  }

  private async call<R>(op: string, data: Record<string, unknown>): Promise<R> {
    const fn = httpsCallable<Record<string, unknown>, R>(getFunctions(getApp(), 'europe-west6'), 'passkey');
    return (await fn({ op, ...data })).data;
  }
}
