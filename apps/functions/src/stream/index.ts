import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { StreamChat } from "stream-chat";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";

const streamApiKey = defineSecret('STREAM_API_KEY');
const streamApiSecret = defineSecret('STREAM_API_SECRET');

let serverClient: StreamChat;

// lazy and one-time initialization of the StreamChat client
const getStreamClient = () => {
  if (!serverClient) {
    // Dies wird jetzt nur zur Laufzeit aufgerufen, wenn eine Funktion den Client benötigt.
    serverClient = StreamChat.getInstance(streamApiKey.value(), streamApiSecret.value());
  }
  return serverClient;
};

// When a user is created in Firebase an associated Stream account is also created.
export const createStreamUser = functions.region('europe-west6').auth.user().onCreate(async (user) => {
  logger.log("Firebase user created", user);
  const _client = getStreamClient();
  const response = await _client.upsertUser({
    id: user.uid,
    name: user.displayName,
    email: user.email,
    image: user.photoURL,
  });
  logger.log("Stream user created", response);
  return response;
});

// When a user is deleted from Firebase their associated Stream account is also deleted.
export const deleteStreamUser = functions.region('europe-west6').auth.user().onDelete(async (user) => {
  logger.log("Firebase user deleted", user);
  const _client = getStreamClient();
  const response = await _client.deleteUser(user.uid);
  logger.log("Stream user deleted", response);
  return response;
});

// Get Stream user token.
export const getStreamUserToken = onCall({ region: 'europe-west6', cors: true }, (request) => {
  // Checking that the user is authenticated.
  if (!request.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new HttpsError(
      "failed-precondition",
      "The function must be called while authenticated.",
    );
  }
  try {
    const _client = getStreamClient();
    return _client.createToken(
      request.auth.uid,
      undefined,
      Math.floor(new Date().getTime() / 1000),
    );
  } catch (err) {
    console.error(`Unable to get user token with ID ${request.auth.uid} on Stream. Error ${err}`);
    // Throwing an HttpsError so that the client gets the error details.
    throw new HttpsError("aborted", "Could not get Stream user");
  }
});

// Revoke the authenticated user's Stream chat token.
export const revokeStreamUserToken = onCall({ region: 'europe-west6', cors: true }, async (request) => {
  // Checking that the user is authenticated.
  if (!request.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new HttpsError(
      "failed-precondition",
      "The function must be called while authenticated.",
    );
  }
  try {
    const _client = getStreamClient();
    return await _client.revokeUserToken(request.auth.uid);
  } catch (err) {
    console.error(
      `Unable to revoke user token with ID ${request.auth.uid} on Stream. Error ${err}`,
    );
    // Throwing an HttpsError so that the client gets the error details.
    throw new HttpsError("aborted", "Could not get Stream user");
  }
});


