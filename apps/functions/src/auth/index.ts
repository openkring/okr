/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';

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
    logger.info('createCustomToken: Processing request', {
      uid: request.data.uid,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });

    checkAppCheckToken(request, 'createCustomToken');
    checkAuthentication(request, 'createCustomToken');
    checkAdminUser(request, 'createCustomToken');
    checkStringField(request, 'createCustomToken', 'uid');

    try {
      logger.info(`createCustomToken: user ${request.auth?.uid} wants custom token of user ${request.data.uid}`);
      const _customToken = await getAuth().createCustomToken(request.data.uid);
      logger.info(`createCustomToken: custom token created successfully: ${_customToken}`);
      return { success: true, token: _customToken };
    } catch (error: any) {
      console.error('createCustomToken: ERROR: ', error);
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
    logger.info('createFirebaseUser: Processing request', {
      email: request.data.email,
      password: request.data.password,
      displayName: request.data.displayName,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });

    checkAppCheckToken(request, 'createFirebaseUser');
    checkAuthentication(request, 'createFirebaseUser');
    checkAdminUser(request, 'createFirebaseUser');
    await checkAdminClaim(request, 'createFirebaseUser');

    try {
      const userRecord = await getAuth().createUser({
        email: request.data.email,
        password: request.data.password,
        displayName: request.data.displayName,
      });
      console.log('createFirebaseUser: OK');
      return { uid: userRecord.uid };
    } catch (error: any) {
      console.error('createFirebaseUser: ERROR: ', error);
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
    logger.info('getUidByEmail: Processing request', {
      email: request.data.email,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    checkAppCheckToken(request, 'getUidByEmail');
    checkAuthentication(request, 'getUidByEmail');
    checkAdminUser(request, 'getUidByEmail');
    await checkAdminClaim(request, 'getUidByEmail');
    checkStringField(request, 'getUidByEmail', 'email');

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
    logger.info('getFirebaseUser: Processing request', {
      uid: request.data.uid,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    checkAppCheckToken(request, 'getFirebaseUser');
    checkAuthentication(request, 'getFirebaseUser');
    checkAdminUser(request, 'getFirebaseUser');
    await checkAdminClaim(request, 'getFirebaseUser');
    checkStringField(request, 'getFirebaseUser', 'uid');

    try {
      const user = await getAuth().getUser(request.data.uid);
      console.log('getFirebaseUser: OK');
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
      console.error('getFirebaseUser: ERROR: ', error);
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
    logger.info('setPassword: Processing request', {
      uid: request.data.uid,
      password: request.data.password,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });
    checkAppCheckToken(request, 'setPassword');
    checkAuthentication(request, 'setPassword');
    checkAdminUser(request, 'setPassword');
    await checkAdminClaim(request, 'setPassword');
    checkStringField(request, 'setPassword', 'uid');
    checkStringField(request, 'setPassword', 'password');
    try {
      await getAuth().updateUser(request.data.uid, { password: request.data.password });
      console.log('setPassword: OK');
    } catch (error: any) {
      console.error('setPassword: ERROR: ', error);
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
    logger.info('setLoginEmail: Processing request', {
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
    checkAppCheckToken(request, 'updateFirebaseUser');
    checkAuthentication(request, 'updateFirebaseUser');
    checkAdminUser(request, 'updateFirebaseUser');
    await checkAdminClaim(request, 'updateFirebaseUser');
    checkStringField(request, 'updateFirebaseUser', 'uid');
    checkStringField(request, 'updateFirebaseUser', 'email');
    try {
      await getAuth().updateUser(request.data.uid, {
        email: request.data.email,
        displayName: request.data.displayName,
        emailVerified: request.data.emailVerified,
        disabled: request.data.disabled,
        phoneNumber: request.data.phone,
        photoURL: request.data.photoUrl,
      });
      console.log('updateFirebaseUser: OK');
    } catch (error: any) {
      console.error('updateFirebaseUser: ERROR: ', error);
      throw new functions.HttpsError('internal', `Failed to update the firebase user: ${error.message}`);
    }
  }
);

function checkAppCheckToken(request: functions.CallableRequest, nameOfCallingFunction: string): void {
  if (!request.app) {
    logger.error(`${nameOfCallingFunction}: App Check token missing or invalid`);
    throw new functions.HttpsError('failed-precondition', 'App Check verification failed.');
  }
}

function checkAuthentication(request: functions.CallableRequest, nameOfCallingFunction: string): void {
  // Check if the user is authenticated
  if (!request.auth) {
    logger.error(`${nameOfCallingFunction}: user is not authenticated`);
    throw new functions.HttpsError('unauthenticated', 'user must be authenticated.');
  }
}

function checkAdminUser(request: functions.CallableRequest, nameOfCallingFunction: string): void {
  if (!request.auth?.token.admin) {
    logger.error(`${nameOfCallingFunction}: user ${request.auth?.uid} must be an admin`);
    throw new functions.HttpsError('permission-denied', 'impersonateUser can only be used by admin users.');
  }
}

async function checkAdminClaim(request: functions.CallableRequest, nameOfCallingFunction: string): Promise<void> {
  if (!request.auth?.uid) {
    logger.error(`${nameOfCallingFunction}: uid is mandatory`);
  } else {
    const caller = await getAuth().getUser(request.auth.uid);

    if (!caller.customClaims?.admin) {
      logger.error(`${nameOfCallingFunction}: user ${request.auth?.uid} must be an admin`);
      throw new functions.HttpsError('permission-denied', 'Only admins can create users');
    }
  }
}

function checkStringField(request: functions.CallableRequest, nameOfCallingFunction: string, fieldName: string): void {
  if (!request.data[fieldName] || typeof request.data[fieldName] !== 'string') {
    logger.error(`${nameOfCallingFunction}: invalid ${fieldName} <${request.data[fieldName]}> provided`);
    throw new functions.HttpsError('invalid-argument', `${nameOfCallingFunction} must be called with a valid ${fieldName}.`);
  }
}
