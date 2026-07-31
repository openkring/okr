import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { ErasurePreview, EraseMyDataResponse, ExportMyDataResponse } from '@okr/shared-models';

/**
 * Client wrapper for the three data-subject-rights callables (privacy 1.19, Phase 5B):
 * `exportMyData`, `previewMyErasure` and `eraseMyData`.
 *
 * None of them takes a subject parameter — the Cloud Function derives it from the caller's
 * auth uid, which is what makes them structurally incapable of touching anyone else's
 * data. Do not add an on-behalf-of argument here; that is a separate, admin-gated flow
 * (membership-lifecycle spec §8).
 *
 * The response types come from `@okr/shared-models`, the same declaration the functions
 * return — so a section added to the erasure report cannot silently go unrendered.
 */

/** Success arm. */
export interface PrivacyRightsSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Failure arm. `message` is the German sentence the Cloud Function authored and the modal
 * renders VERBATIM — the honest wording lives next to the rule that produced it rather
 * than in a translation file that drifts from it.
 */
export interface PrivacyRightsFailure {
  readonly ok: false;
  /** The HttpsError code without the SDK's `functions/` prefix, e.g. `failed-precondition`. */
  readonly code: string;
  readonly message: string;
}

export type PrivacyRightsResult<T> = PrivacyRightsSuccess<T> | PrivacyRightsFailure;

/** Last-resort text: every expected failure carries a server-authored German message, so
 * this only shows for a transport failure with nothing to say. */
const GENERIC_FAILURE = 'Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es später erneut.';

function toFailure(error: unknown): PrivacyRightsFailure {
  const raw = error as { code?: unknown; message?: unknown };
  const code = typeof raw?.code === 'string' ? raw.code.replace(/^functions\//, '') : 'unknown';
  const message = typeof raw?.message === 'string' && raw.message.trim() !== ''
    ? raw.message
    : GENERIC_FAILURE;
  return { ok: false, code, message };
}

@Injectable({ providedIn: 'root' })
export class PrivacyRightsService {
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /**
   * D-P5-1: assembles the caller's own export server-side and returns a 15-minute signed
   * URL. Rate-limited to one per hour, which arrives here as a `resource-exhausted`
   * failure with the German explanation — render it, do not retry.
   */
  public async exportMyData(): Promise<PrivacyRightsResult<ExportMyDataResponse>> {
    return this.call<void, ExportMyDataResponse>('exportMyData', undefined);
  }

  /** The preflight report. Read-only: it changes nothing and may be called freely. */
  public async previewErasure(): Promise<PrivacyRightsResult<ErasurePreview>> {
    return this.call<void, ErasurePreview>('previewMyErasure', undefined);
  }

  /**
   * Executes the erasure. `previewToken` must be the token from the report the member
   * actually saw: the function rebuilds the report server-side and refuses a token that no
   * longer matches, so a confirmation cannot execute a situation that has since changed.
   * That refusal is a normal outcome — a `failed-precondition` failure, not an exception.
   */
  public async eraseMyData(previewToken: string): Promise<PrivacyRightsResult<EraseMyDataResponse>> {
    return this.call<{ previewToken: string }, EraseMyDataResponse>('eraseMyData', { previewToken });
  }

  private async call<TReq, TRes>(name: string, payload: TReq): Promise<PrivacyRightsResult<TRes>> {
    try {
      const fn = httpsCallable<TReq, TRes>(this.functions, name);
      const result = await fn(payload);
      return { ok: true, value: result.data };
    } catch (error) {
      // Never console.error the payload: these calls carry the member's own subject data.
      console.warn(`PrivacyRightsService.${name} failed`, (error as { code?: string })?.code ?? 'unknown');
      return toFailure(error);
    }
  }
}
