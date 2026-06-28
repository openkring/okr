/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAdminRole, checkAppCheckToken, checkAuthentication, checkStringField } from '@bk2/shared-util-functions';
import { getAppEmailConfig } from './email-templates';
import { EmailAttachment, isValidProvider, sendEmailViaProvider } from './email-transport';

/** Storage prefixes that `generateDocument` writes generated documents to. */
const ALLOWED_ATTACHMENT_PREFIXES = ['generated-docs/', 'generated-docs-ephemeral/'];

/** Max size of an inline (base64) attachment after decoding. */
const MAX_INLINE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/**
 * An attachment is either a reference to a generated document in Storage (server-fetched), or an
 * inline base64 payload (e.g. a file the user picked from their device in the email composer).
 */
type AttachmentRef =
  | { storagePath: string; filename?: string }
  | { filename: string; contentBase64: string; contentType?: string };

/** Infer a content type from a storage path extension (attachments are PDFs in practice). */
function contentTypeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':  return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'html': return 'text/html';
    default:     return 'application/octet-stream';
  }
}

/**
 * Resolve attachment references ({ storagePath, filename }) into in-memory EmailAttachments by
 * downloading them from the default Storage bucket via the Admin SDK. Paths are validated against an
 * allow-list so the callable cannot be coerced into reading arbitrary Storage objects.
 */
async function resolveAttachments(
  refs: AttachmentRef[] | undefined,
  cfName: string,
): Promise<EmailAttachment[]> {
  if (!refs?.length) return [];
  const bucket = getStorage().bucket();
  const resolved: EmailAttachment[] = [];
  for (const ref of refs) {
    // Inline base64 attachment (user-picked file) — no Storage involved.
    if ('contentBase64' in ref) {
      const content = Buffer.from(ref.contentBase64, 'base64');
      if (content.length > MAX_INLINE_ATTACHMENT_BYTES) {
        throw new functions.HttpsError('invalid-argument', `${cfName}: attachment too large: ${ref.filename}`);
      }
      resolved.push({
        filename: ref.filename || 'attachment',
        content,
        contentType: ref.contentType || 'application/octet-stream',
      });
      continue;
    }
    // Storage reference — validate against the allow-list and download via the Admin SDK.
    const path = ref.storagePath ?? '';
    const isAllowed = ALLOWED_ATTACHMENT_PREFIXES.some(p => path.startsWith(p));
    if (!isAllowed || path.includes('..')) {
      throw new functions.HttpsError('invalid-argument', `${cfName}: attachment path not allowed: ${path}`);
    }
    const [content] = await bucket.file(path).download();
    resolved.push({
      filename: ref.filename || path.split('/').pop() || 'document.pdf',
      content,
      contentType: contentTypeFromPath(path),
    });
  }
  return resolved;
}

// onCall methods are automatically POST requests, so we don't need to check the method.

/**
 * Creates a custom token for an existing user.
 * The custom token can be used by admin users on the client side to login as this user (impersonate).
 * @param: uid the firebase user id of the user to impersonate
 * @return: the custom token of the given user
 */
export const createCustomToken = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest<{ uid: string }>) => {
    const CF_NAME = 'createCustomToken';
    logger.info(`${CF_NAME}: Processing request`, {
      uid: request.data.uid,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });

    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'uid');

    try {
      logger.info(`${CF_NAME}: user ${request.auth?.uid} wants custom token of user ${request.data.uid}`);
      const _customToken = await getAuth().createCustomToken(request.data.uid);
      // Do NOT log the token itself — a custom token can be exchanged for a full
      // session of the impersonated user (H-4). Log only the target uid.
      logger.info(`${CF_NAME}: custom token created successfully for uid ${request.data.uid}`);
      return { success: true, token: _customToken };
    } catch (error: any) {
      console.error(`${CF_NAME}: ERROR: `, error);
      throw new functions.HttpsError('internal', `Could not create custom token: ${error.message}`);
    }
  }
);

/**
 * Create a new firebase user.
 * @param email the login email of the new user
 * @param password the password of the new user
 * @param displayName the display name fo the new user
 */
export const createFirebaseUser = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest<{ email: string; password: string; displayName: string }>) => {
    const CF_NAME = 'createFirebaseUser';
    logger.info(`${CF_NAME}: Processing request`, {
      email: request.data.email,
      password: request.data.password,
      displayName: request.data.displayName,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });

    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);

    try {
      const userRecord = await getAuth().createUser({
        email: request.data.email,
        password: request.data.password,
        displayName: request.data.displayName,
      });
      console.log(`${CF_NAME}: OK`);
      return { uid: userRecord.uid };
    } catch (error: any) {
      console.error(`${CF_NAME}: ERROR: `, error);
      throw new functions.HttpsError('internal', `Failed to create user: ${error.message}`);
    }
  }
);

/**
 * Lookup a firebase user by its loginEmail and return its uid.
 * @param: email the login email of the user to lookup
 * @return: the firebase uid of the user with the given email
 */
export const getUidByEmail = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest<{ email: string }>) => {
    const CF_NAME = 'getUidByEmail';
    logger.info(`${CF_NAME}: Processing request`, {
      email: request.data.email,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'email');

    try {
      const user = await getAuth().getUserByEmail(request.data.email);
      console.log('getUidByEmail: OK');
      return { uid: user.uid };
    } catch (error: any) {
      console.error('getUidByEmail: ERROR: ', error);
      throw new functions.HttpsError('internal', `Failed to get the uid: ${error.message}`);
    }
  }
);

/**
 * Lookup a firebase user by its uid.
 * @param: uid the firebase user id to lookup
 * @return: limited user data to avoid exposing sensitive fields
 */
export const getFirebaseUser = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest<{ uid: string }>) => {
    const CF_NAME = 'getFirebaseUser';
    logger.info(`${CF_NAME}: Processing request`, {
      uid: request.data.uid,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'uid');

    try {
      const user = await getAuth().getUser(request.data.uid);
      console.log(`${CF_NAME}: OK`);
      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        disabled: user.disabled,
        phone: user.phoneNumber,
        photoUrl: user.photoURL,
      };
      // tbd: customClaims, multiFactor
    } catch (error: any) {
      console.error(`${CF_NAME}: ERROR: `, error);
      throw new functions.HttpsError('internal', `Failed to get the firebase user: ${error.message}`);
    }
  }
);

/**
 * Change the password to a given value.
 * @param uid firebase user id of the user to set its password for
 * @param password the new password
 */
export const setPassword = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest<{ uid: string; password: string }>) => {
    const CF_NAME = 'setPassword';
    logger.info(`${CF_NAME}: Processing request`, {
      uid: request.data.uid,
      password: request.data.password,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'uid');
    checkStringField(request as any, CF_NAME, 'password');
    try {
      await getAuth().updateUser(request.data.uid, { password: request.data.password });
      console.log(`${CF_NAME}: OK`);
    } catch (error: any) {
      console.error(`${CF_NAME}: ERROR: `, error);
      throw new functions.HttpsError('internal', `Failed to set the password: ${error.message}`);
    }
  }
);

/**
 * Change attributes of an existing firebase user.
 * @param uid firebase user id of the user to change
 * @param email the new login email
 * @param displayName the new display name
 * @param emailVerified true, if the email was verified
 * @param disabled true if the account is disabled
 * @param phone the new phone number
 * @param photoUrl the new url to the picture of the user
 */
export const updateFirebaseUser = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest<{ uid: string; email: string; displayName: string; emailVerified: boolean; disabled: boolean; phone: string; photoUrl: string }>) => {
    const CF_NAME = 'updateFirebaseUser';
    logger.info(CF_NAME + ': Processing request', {
      uid: request.data.uid,
      email: request.data.email,
      displayName: request.data.displayName,
      emailVerified: request.data.emailVerified,
      disabled: request.data.disabled,
      phone: request.data.phone,
      photoUrl: request.data.photoUrl,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'uid');
    checkStringField(request as any, CF_NAME, 'email');
    try {
      await getAuth().updateUser(request.data.uid, {
        email: request.data.email,
        displayName: request.data.displayName || undefined,
        emailVerified: request.data.emailVerified,
        disabled: request.data.disabled,
        phoneNumber: request.data.phone || undefined,
        photoURL: request.data.photoUrl || undefined,
      });
      console.log(CF_NAME + ': OK');
    } catch (error: any) {
      console.error(CF_NAME + ': ERROR: ', error);
      throw new functions.HttpsError('internal', `Failed to update the firebase user: ${error.message}`);
    }
  }
);

export type FirebaseAuthUser = {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  disabled: boolean;
  emailVerified: boolean;
  creationTime: string | undefined;
  lastSignInTime: string | undefined;
};

export const listFirebaseUsers = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest): Promise<{ users: FirebaseAuthUser[] }> => {
    const CF_NAME = 'listFirebaseUsers';
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);

    const users: FirebaseAuthUser[] = [];
    let pageToken: string | undefined;

    do {
      const result = await getAuth().listUsers(1000, pageToken);
      for (const u of result.users) {
        users.push({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          disabled: u.disabled,
          emailVerified: u.emailVerified,
          creationTime: u.metadata.creationTime,
          lastSignInTime: u.metadata.lastSignInTime,
        });
      }
      pageToken = result.pageToken;
    } while (pageToken);

    logger.info(`${CF_NAME}: returned ${users.length} users`);
    return { users };
  }
);

/**
 * List all non-archived BK user documents across ALL tenants (Admin SDK bypasses
 * Firestore rules). The AOC user-account view needs this cross-tenant set to tell
 * "no BK account anywhere" apart from "BK account in another tenant"; a client-side
 * cross-tenant `list` on /users is (correctly) denied by the rules. Admin-only.
 */
export const listBkUsers = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request: functions.CallableRequest): Promise<{ users: any[] }> => {
    const CF_NAME = 'listBkUsers';
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);

    const snap = await getFirestore()
      .collection('users')
      .where('isArchived', '==', false)
      .get();
    const users = snap.docs.map(doc => ({ bkey: doc.id, ...doc.data() }));

    logger.info(`${CF_NAME}: returned ${users.length} users`);
    return { users };
  }
);

export const deleteFirebaseAuthUser = functions.onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request: functions.CallableRequest<{ uid: string }>): Promise<void> => {
    const CF_NAME = 'deleteFirebaseAuthUser';
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    await checkAdminRole(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'uid');
    const { uid } = request.data;
    await getAuth().deleteUser(uid);
    logger.info(`${CF_NAME}: deleted user ${uid}`);
  }
);

/**
 * Send an email via a configurable provider.
 * Also handles password reset emails when template === 'scs_password_reset':
 * generates a Firebase password reset link and injects { url, email, app_name }
 * into templateVariables automatically. No authentication required for this case.
 * For all other templates/html sends, the caller must be authenticated.
 * @param to                list of recipient email addresses
 * @param cc                optional CC addresses
 * @param bcc               optional BCC addresses
 * @param appId             human-readable app identifier (e.g. 'scs', 'test')
 * @param html              HTML body (may be empty when using a template)
 * @param from              sender address (derived from app config for password reset)
 * @param subject           email subject line (derived from app config for password reset)
 * @param provider          email provider: 'mailgun_smtp' | 'mailtrap_api' | 'netzone_smtp' | 'mailtrap_test'
 * @param template          optional template name (e.g. 'scs_password_reset')
 * @param templateVariables optional variables passed to the template
 */
export const sendEmail = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'],
  },
  async (request: functions.CallableRequest<{ to: string[]; cc?: string[]; bcc?: string[]; appId: string; html?: string; from?: string; subject?: string; provider: string; template?: string; templateVariables?: Record<string, string>; attachments?: AttachmentRef[] }>) => {
    const CF_NAME = 'sendEmail';
    checkAppCheckToken(request as any, CF_NAME);

    const { to, cc, bcc, appId, provider, template, attachments } = request.data;
    let { html, from, subject, templateVariables } = request.data;

    const isPasswordReset = template === 'scs_password_reset';
    if (!isPasswordReset) {
      checkAuthentication(request as any, CF_NAME);
    }

    if (!Array.isArray(to) || to.length === 0) {
      throw new functions.HttpsError('invalid-argument', 'to must be a non-empty array.');
    }
    checkStringField(request as any, CF_NAME, 'appId');
    if (!isValidProvider(provider)) {
      throw new functions.HttpsError('invalid-argument', `Unknown provider: ${provider}`);
    }

    if (isPasswordReset) {
      const config = await getAppEmailConfig(appId);
      // generatePasswordResetLink throws auth/user-not-found for an unregistered
      // address — so a reset link is only ever produced for a real account. To
      // avoid turning that into an account-enumeration oracle, swallow the error
      // and return the SAME generic success response without sending (M-3).
      let link: string;
      try {
        link = await getAuth().generatePasswordResetLink(to[0], { url: config.continueUrl });
      } catch (e: any) {
        logger.info(`${CF_NAME}: password-reset requested for an address with no account — responding generically (${e?.errorInfo?.code ?? e?.code ?? 'error'})`);
        return { success: true };
      }
      from = config.from;
      subject = `Passwort zurücksetzen – ${config.appName}`;
      html = `<p>Passwort zurücksetzen: <a href="${link}">${link}</a></p>`;
      // Only controlled variables — do not echo caller-supplied templateVariables
      // into the password-reset email.
      templateVariables = { url: link, email: to[0], app_name: config.appName };
      logger.info(`${CF_NAME}: generated reset link (appId=${appId}, provider=${provider})`);
    }

    // When the caller does not supply a sender, fall back to the app's verified sender
    // address (same one used for password-reset) so the provider accepts the from-domain.
    if (!from) from = (await getAppEmailConfig(appId)).from;
    if (!from) throw new functions.HttpsError('invalid-argument', 'from is required.');
    if (!subject) throw new functions.HttpsError('invalid-argument', 'subject is required.');

    logger.info(`${CF_NAME}: sending via ${provider} to=${to.join(', ')} (appId=${appId}, template=${template ?? 'none'})`);

    // Attachments are resolved server-side from Storage (never on the password-reset path).
    const resolvedAttachments = isPasswordReset ? [] : await resolveAttachments(attachments, CF_NAME);

    try {
      await sendEmailViaProvider(provider, { from, to, cc, bcc, subject, html: html ?? '', template, templateVariables, attachments: resolvedAttachments });
      logger.info(`${CF_NAME}: email sent to ${to.join(', ')}${resolvedAttachments.length ? ` with ${resolvedAttachments.length} attachment(s)` : ''}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`${CF_NAME}: failed to send email`, { error: error.message });
      throw new functions.HttpsError('internal', 'Failed to send email.');
    }
  }
);

