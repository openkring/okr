import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { WebAuthnAbortService, browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

import { ENV } from '@okr/shared-config';
import { PasskeyItem } from '@okr/shared-models';

type OptionsResult<T> = { challengeId: string; options: T };

/**
 * Registration options fetched ahead of the user's tap (see PasskeyService.prepareRegistration).
 * The challenge behind it expires after 5 minutes.
 */
export type PreparedRegistration = OptionsResult<PublicKeyCredentialCreationOptionsJSON>;
/** Sign-in options fetched ahead of the ceremony (see PasskeyService.prepareLogin). */
export type PreparedLogin = OptionsResult<PublicKeyCredentialRequestOptionsJSON>;

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

  /** Can this browser offer passkeys in the username field's autofill (conditional mediation)? */
  public async canAutofill(): Promise<boolean> {
    if (!this.canSignIn()) return false;
    try {
      return await browserSupportsWebAuthnAutofill();
    } catch {
      return false;
    }
  }

  /**
   * Run the assertion ceremony and return a Firebase custom token for signInWithCustomToken.
   * `prepared`: options from prepareLogin(); fetched here when absent.
   * `autofill`: a conditional request that waits until the user picks a passkey from the autofill
   * of an `autocomplete="… webauthn"` field — it never shows a dialog of its own.
   */
  public async getLoginToken(prepared?: PreparedLogin, autofill = false): Promise<string> {
    const { challengeId, options } = prepared ?? await this.prepareLogin();
    const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
    const { token } = await this.call<{ token: string }>('loginVerify', { tenantId: this.env.tenantId, challengeId, response });
    return token;
  }

  /** Fetch the sign-in options (a fresh challenge, valid 5 minutes) without starting the ceremony. */
  public async prepareLogin(): Promise<PreparedLogin> {
    return this.call<PreparedLogin>('loginOptions', this.rp());
  }

  /** Abort a pending ceremony, e.g. the autofill request when the login page is left. */
  public cancelCeremony(): void {
    WebAuthnAbortService.cancelCeremony();
  }

  /**
   * Fetch the registration options before the user taps. Safari wants the WebAuthn call close to
   * the tap; a callable round trip in between can use up that window.
   */
  public async prepareRegistration(): Promise<PreparedRegistration> {
    return this.call<PreparedRegistration>('registerOptions', this.rp());
  }

  /** Create a passkey for the signed-in user on this device. */
  public async register(prepared?: PreparedRegistration): Promise<PasskeyItem> {
    const { challengeId, options } = prepared ?? await this.prepareRegistration();
    const response = await startRegistration({ optionsJSON: options });
    const { item } = await this.call<{ item: PasskeyItem }>('registerVerify', { tenantId: this.env.tenantId, challengeId, response });
    return item;
  }

  /** `thisHost`: only the passkeys bound to this app's host (rpId). */
  public async list(uid: string, thisHost = false): Promise<PasskeyItem[]> {
    return (await this.call<{ items: PasskeyItem[] }>('list', thisHost ? { uid, rpId: location.hostname } : { uid })).items;
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
