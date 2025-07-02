import * as admin from "firebase-admin";
import { defineString } from "firebase-functions/params";
import * as functions from "firebase-functions/v1";
import { StreamChat } from "stream-chat";

admin.initializeApp();

const streamApiKey = defineString('STREAM_API_KEY');
const streamApiSecret = defineString('STREAM_API_SECRET');

const serverClient = StreamChat.getInstance(streamApiKey.value(), streamApiSecret.value());

// When a user is created in Firebase an associated Stream account is also created.
export const createStreamUser = functions.auth.user().onCreate(async (user) => {
  functions.logger.log("Firebase user created", user);
  // Create user using the serverClient.
  const response = await serverClient.upsertUser({
    id: user.uid,
    name: user.displayName,
    email: user.email,
    image: user.photoURL,
  });
  functions.logger.log("Stream user created", response);
  return response;
});

// When a user is deleted from Firebase their associated Stream account is also deleted.
export const deleteStreamUser = functions.auth.user().onDelete(async (user) => {
  functions.logger.log("Firebase user deleted", user);
  const response = await serverClient.deleteUser(user.uid);
  functions.logger.log("Stream user deleted", response);
  return response;
});

// Get Stream user token.
export const getStreamUserToken = functions.https.onCall((data, context) => {
  // Checking that the user is authenticated.
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated.",
    );
  } else {
    try {
      return serverClient.createToken(
        context.auth.uid,
        undefined,
        Math.floor(new Date().getTime() / 1000),
      );
    } catch (err) {
      console.error(`Unable to get user token with ID ${context.auth.uid} on Stream. Error ${err}`);
      // Throwing an HttpsError so that the client gets the error details.
      throw new functions.https.HttpsError("aborted", "Could not get Stream user");
    }
  }
});

// Revoke the authenticated user's Stream chat token.
export const revokeStreamUserToken = functions.https.onCall(async (data, context) => {
  // Checking that the user is authenticated.
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated.",
    );
  } else {
    try {
      return await serverClient.revokeUserToken(context.auth.uid);
    } catch (err) {
      console.error(
        `Unable to revoke user token with ID ${context.auth.uid} on Stream. Error ${err}`,
      );
      // Throwing an HttpsError so that the client gets the error details.
      throw new functions.https.HttpsError("aborted", "Could not get Stream user");
    }
  }
});


