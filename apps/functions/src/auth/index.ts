/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { checkAdminClaim, checkAdminUser, checkAppCheckToken, checkAuthentication, checkStringField } from '@bk2/shared-util-functions';
import * as nodemailer from 'nodemailer';
import { getAppEmailConfig, buildPasswordResetHtml } from './email-templates';

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
 * Send a generic HTML email via Mailgun SMTP.
 * Intended for admin/privileged users to send article content or other HTML emails.
 * @param emails  list of recipient email addresses
 * @param appId   human-readable app identifier for per-app branding (e.g. 'scs', 'test')
 * @param html    HTML body of the email
 * @param from    sender address, also used as replyTo
 * @param subject email subject line
 */
export const sendEmailPerSmtp = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: ['MAILGUN_SMTP_PASSWORD'],
  },
  async (request: functions.CallableRequest<{ emails: string[]; appId: string; html: string; from: string; subject: string }>) => {
    const CF_NAME = 'sendEmailPerSmtp';
    checkAppCheckToken(request as any, CF_NAME);
    checkAuthentication(request as any, CF_NAME);

    const { emails, appId, html, from, subject } = request.data;

    if (!Array.isArray(emails) || emails.length === 0) {
      throw new functions.HttpsError('invalid-argument', 'emails must be a non-empty array.');
    }
    checkStringField(request as any, CF_NAME, 'appId');
    checkStringField(request as any, CF_NAME, 'html');
    checkStringField(request as any, CF_NAME, 'from');
    checkStringField(request as any, CF_NAME, 'subject');

    logger.info(`${CF_NAME}: sending email to ${emails.join(', ')} (appId=${appId})`);

    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false,
        auth: {
          user: 'postmaster@mail.seeclub.org',
          pass: process.env['MAILGUN_SMTP_PASSWORD'],
        },
      });

      await transporter.sendMail({
        from,
        replyTo: from,
        to: emails.join(', '),
        subject,
        html,
      });

      logger.info(`${CF_NAME}: email sent to ${emails.join(', ')}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`${CF_NAME}: failed to send email`, { error: error.message });
      throw new functions.HttpsError('internal', 'Failed to send email.');
    }
  }
);

/**
 * Send a branded password reset email via Mailgun SMTP.
 * Called from the client instead of the Firebase SDK sendPasswordResetEmail(),
 * allowing per-app branding based on the appId.
 * @param email  the user's email address
 * @param appId  the human-readable app identifier (e.g. 'scs', 'test')
 */
export const sendPasswordResetEmail = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: ['MAILGUN_SMTP_PASSWORD'],
  },
  async (request: functions.CallableRequest<{ email: string; appId: string }>) => {
    const CF_NAME = 'sendPasswordResetEmail';
    checkAppCheckToken(request as any, CF_NAME);
    checkStringField(request as any, CF_NAME, 'email');
    checkStringField(request as any, CF_NAME, 'appId');

    const { email, appId } = request.data;
    const config = getAppEmailConfig(appId);

    logger.info(`${CF_NAME}: generating reset link for ${email} (appId=${appId})`);

    try {
      const link = await getAuth().generatePasswordResetLink(email, {
        url: config.continueUrl,
      });

      const transporter = nodemailer.createTransport({
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false,
        auth: {
          user: 'postmaster@mail.seeclub.org',
          pass: process.env['MAILGUN_SMTP_PASSWORD'],
        },
      });

      await transporter.sendMail({
        from: config.from,
        replyTo: config.replyTo,
        to: email,
        subject: `Passwort zurücksetzen – ${config.appName}`,
        html: buildPasswordResetHtml(config.appName, config.primaryColor, config.logoUrl, email, link),
      });

      logger.info(`${CF_NAME}: password reset email sent to ${email}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`${CF_NAME}: failed to send email to ${email}`, { error: error.message });
      throw new functions.HttpsError('internal', 'Failed to send password reset email.');
    }
  }
);

