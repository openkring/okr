// apps/functions/src/newsletter/confirm.logic.ts — the pure decision of the confirmation endpoint (spec 1.169 §5.3).

import { toStoreDateTime } from '../srv/zurich-time';
import { NewsletterSignupDoc } from './types';

export type ConfirmOutcome = 'confirm' | 'alreadyConfirmed' | 'invalid' | 'expired';

/**
 * What the confirmation link does. Positive state check: only 'pending' can lead to 'confirm', only
 * 'confirmed' to 'alreadyConfirmed'; any other (unknown) state is invalid.
 */
export function confirmOutcome(signup: NewsletterSignupDoc | undefined, sigOk: boolean, groupOk: boolean, now: Date): ConfirmOutcome {
  if (!sigOk || !signup || !groupOk) return 'invalid';
  if (signup.state === 'confirmed') return 'alreadyConfirmed';
  if (signup.state !== 'pending') return 'invalid';
  if (toStoreDateTime(now) > signup.expiresAt) return 'expired';
  return 'confirm';
}
