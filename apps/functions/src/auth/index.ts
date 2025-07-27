import * as admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";

// app is initialized in init.ts (with default service account) which is imported in main.ts 

export const impersonateUser = onCall({ region: 'europe-west6', cors: true }, async (request) => {
  logger.log("impersonateUser: impersonating user", request.data?.uid);

  // Checking that the user is authenticated
  if (!request.auth) {
    logger.error("impersonateUser: user is not authenticated");
    throw new HttpsError("failed-precondition", "impersonateUser must be called while authenticated.");
  }
  // checking that the user has admin rights (claims, set in firefoo)
  if (!request.auth.token['admin']) {
    logger.error("impersonateUser: must be called by an admin user");
    throw new HttpsError("permission-denied", "impersonateUser can only be used by admin users.");
  }
  // check if the uid of the user to impersonate is provided
  if (!request.data?.uid) {
    logger.error("impersonateUser: must be called with a uid to impersonate");
    throw new HttpsError("invalid-argument", "impersonateUser must be called with a uid to impersonate.");
  }
  try {
    const _result = await admin.auth().createCustomToken(request.data.uid);
    logger.log("impersonateUser: custom token created", _result);
    return _result; // return the custom token
  } catch (error) {
    console.error('impersonateUser: error creating custom token', error);
    throw new HttpsError("aborted", "Could not create custom token");
  }
});
