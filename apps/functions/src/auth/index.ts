/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { checkAdminClaim, checkAdminUser, checkAppCheckToken, checkAuthentication, checkStringField } from '@bk2/shared-util-functions';
import { getAppEmailConfig } from './email-templates';
import { isValidProvider, sendEmailViaProvider } from './email-transport';

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
    checkAdminUser(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'uid');

    try {
      logger.info(`${CF_NAME}: user ${request.auth?.uid} wants custom token of user ${request.data.uid}`);
      const _customToken = await getAuth().createCustomToken(request.data.uid);
      logger.info(`${CF_NAME}: custom token created successfully: ${_customToken}`);
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
    checkAdminUser(request as any, CF_NAME);
    await checkAdminClaim(request as any, CF_NAME);

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
    checkAdminUser(request as any, CF_NAME);
    await checkAdminClaim(request as any, CF_NAME);
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
    checkAdminUser(request as any, CF_NAME);
    await checkAdminClaim(request as any, CF_NAME);
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
    checkAdminUser(request as any, CF_NAME);
    await checkAdminClaim(request as any, CF_NAME);
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
    checkAdminUser(request as any, CF_NAME);
    await checkAdminClaim(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'uid');
    checkStringField(request as any, CF_NAME, 'email');
    try {
      await getAuth().updateUser(request.data.uid, {
        email: request.data.email,
        displayName: request.data.displayName,
        emailVerified: request.data.emailVerified,
        disabled: request.data.disabled,
        phoneNumber: request.data.phone,
        photoURL: request.data.photoUrl,
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
    checkAdminUser(request as any, CF_NAME);

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

export const deleteFirebaseAuthUser = functions.onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request: functions.CallableRequest<{ uid: string }>): Promise<void> => {
    const CF_NAME = 'deleteFirebaseAuthUser';
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);
    checkAdminUser(request as any, CF_NAME);
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
  async (request: functions.CallableRequest<{ to: string[]; cc?: string[]; bcc?: string[]; appId: string; html?: string; from?: string; subject?: string; provider: string; template?: string; templateVariables?: Record<string, string> }>) => {
    const CF_NAME = 'sendEmail';
    checkAppCheckToken(request as any, CF_NAME);

    const { to, cc, bcc, appId, provider, template } = request.data;
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
      const config = getAppEmailConfig(appId);
      const link = await getAuth().generatePasswordResetLink(to[0], { url: config.continueUrl });
      from = config.from;
      subject = `Passwort zurücksetzen – ${config.appName}`;
      html = `<p>Passwort zurücksetzen: <a href="${link}">${link}</a></p>`;
      templateVariables = { ...templateVariables, url: link, email: to[0], app_name: config.appName };
      logger.info(`${CF_NAME}: generated reset link for ${to[0]} (appId=${appId}, provider=${provider})`);
    }

    if (!from) throw new functions.HttpsError('invalid-argument', 'from is required.');
    if (!subject) throw new functions.HttpsError('invalid-argument', 'subject is required.');

    logger.info(`${CF_NAME}: sending via ${provider} to=${to.join(', ')} (appId=${appId}, template=${template ?? 'none'})`);

    try {
      await sendEmailViaProvider(provider, { from, to, cc, bcc, subject, html: html ?? '', template, templateVariables });
      logger.info(`${CF_NAME}: email sent to ${to.join(', ')}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`${CF_NAME}: failed to send email`, { error: error.message });
      throw new functions.HttpsError('internal', 'Failed to send email.');
    }
  }
);

