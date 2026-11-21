/**
 * A pending double-opt-in sign-up (spec 1.169): an e-mail address from the public form that is not
 * yet a person. Server-only — `firestore.rules` denies every client read and write. Deleted on
 * confirmation or when it expires.
 */
export interface NewsletterSignupDoc {
  tenants: string[];
  /** FK -> groups (kind 'newsletter') */
  groupKey: string;
  /** FK -> the form the sign-up came from */
  formKey: string;
  firstName: string;
  lastName: string;
  /** lowercased */
  email: string;
  city: string;
  /** StoreDateTime (yyyyMMddHHmmss) */
  createdAt: string;
  /** StoreDateTime (yyyyMMddHHmmss) after which the confirmation link is dead */
  expiresAt: string;
  state: 'pending' | 'confirmed';
  /** canonical mailbox (no +tag, gmail dots) — set when the confirmation mail went out */
  mailboxKey?: string;
  /** StoreDateTime the confirmation mail went out */
  mailedAt?: string;
}

export const NewsletterSignupCollection = 'newsletterSignups';
