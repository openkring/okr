import * as functions from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

export const impersonateUser = functions.onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true
  },
  async (request: functions.CallableRequest<{ uid: string }>) => {
    // onCall methods are automatically POST requests, so we don't need to check the method.

    logger.info('impersonateUser: Processing request', {
      uid: request.data.uid,
      authUid: request.auth?.uid,
      appCheck: !!request.app,
      serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'default',
    });

    // Check App Check token
    if (!request.app) {
      logger.error('impersonateUser: App Check token missing or invalid');
      throw new functions.HttpsError('failed-precondition', 'App Check verification failed.');
    }

    // Check if the user is authenticated
    if (!request.auth) {
      logger.error(`impersonateUser: user ${request.data?.uid} is not authenticated`);
      throw new functions.HttpsError('unauthenticated', 'impersonateUser must be called while authenticated.');
    }

    // Check if the user has admin rights
    if (!request.auth.token.admin) {
      logger.error(`impersonateUser: user ${request.auth.uid} must be an admin`);
      throw new functions.HttpsError('permission-denied', 'impersonateUser can only be used by admin users.');
    }

    // Check if the uid of the user to impersonate is provided
    if (!request.data.uid || typeof request.data.uid !== 'string') {
      logger.error(`impersonateUser: invalid uid <${request.data?.uid}> provided`);
      throw new functions.HttpsError('invalid-argument', 'impersonateUser must be called with a valid UID to impersonate.');
    }

    try {
      logger.info(`impersonateUser: Attempting to impersonate user ${request.data.uid}`);
      logger.info(`impersonateUser: Service account=<${process.env.GOOGLE_APPLICATION_CREDENTIALS}>`);
      logger.info(`impersonateUser: User${request.auth.uid} is impersonating ${request.data.uid}`);
      const _customToken = await admin.auth().createCustomToken(request.data.uid);
      logger.info(`impersonateUser: custom token created successfully: ${_customToken}`);
      return { success: true, token: _customToken };
    } catch (error) {
      let errorInfo: { code?: unknown; message?: unknown; stack?: unknown } = {};
      if (error && typeof error === 'object') {
        errorInfo = {
          code: (error as any).code,
          message: (error as any).message,
          stack: (error as any).stack,
        };
      }
      logger.error('impersonateUser: Error creating custom token', {
        uid: request.data.uid,
        error: errorInfo,
      });
      throw new functions.HttpsError('internal', 'Could not create custom token.', error);
    }
  }
);