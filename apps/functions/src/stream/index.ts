import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { StreamChat, UserResponse } from "stream-chat";
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
export const onUserCreated = functions
  .region('europe-west6')
  .runWith({ secrets: ["STREAM_API_KEY", "STREAM_API_SECRET"] })
  .auth.user().onCreate(async (user) => {
  logger.log("onUserCreated: creating stream user for firebase user ", { user });
  try {
    const _client = getStreamClient();
    const response = await _client.upsertUser({
      id: user.uid,
      name: user.displayName,
      image: user.photoURL,
    });
    logger.log("onUserCreated: stream user created", { response });
    return response;
  } catch (error) {
    logger.error("onUserCreated: error creating stream user", { error });
    throw new HttpsError("aborted", "Could not create stream user");
  }
});

// When a user is deleted from Firebase their associated Stream account is also deleted.
export const onUserDeleted = functions
.region('europe-west6')
.runWith({ secrets: ["STREAM_API_KEY", "STREAM_API_SECRET"] })
.auth.user().onDelete(async (user) => {
  logger.log("onUserDeleted: deleting stream user for firebase user ", { user });
  try {
    const _client = getStreamClient();
    const response = await _client.deleteUser(user.uid);
    logger.log("onUserDeleted: stream user deleted", { response });
    return response;
  } catch (error) {
    logger.error("onUserDeleted: error deleting stream user", { error });
    throw new HttpsError("aborted", "Could not delete stream user");
  }
});

// Get Stream user token for the currently authenticated user.
export const getStreamUserToken = onCall({ 
  region: 'europe-west6', 
  cors: true,
  enforceAppCheck: true,
  secrets: [streamApiKey, streamApiSecret] 
}, (request) => {
  logger.log("getStreamUserToken: getting stream user token for user", request.auth?.uid);
  // Checking that the user is authenticated.
  if (!request.auth) {
    logger.error("getStreamUserToken: user is not authenticated");
    throw new HttpsError("failed-precondition", "getStreamUserToken must be called while authenticated.");
  }
  try {
    const _client = getStreamClient();
    const _token = _client.createToken(
      request.auth.uid,
      undefined,
      Math.floor(new Date().getTime() / 1000),
    );
    logger.log("getStreamUserToken: stream user token: ", { _token });
    return _token;
  } catch (error) {
    console.error(`getStreamUserToken: unable to get stream user token with ID ${request.auth.uid}`, { error });
    throw new HttpsError("aborted", "Could not get stream user token");
  }
});

// Get Stream user token for another user (not the currently authenticated user). Requires admin rights.
export const getOtherStreamUserToken = onCall({ 
  region: 'europe-west6', 
  cors: true, 
  enforceAppCheck: true,
  secrets: [streamApiKey, streamApiSecret] 
}, (request) => {
  logger.log("getOtherStreamUserToken: getting stream user token for user ", request.data?.uid);
  // Checking that the user is authenticated.
  if (!request.auth) {
    logger.error("getOtherStreamUserToken: user is not authenticated");
    throw new HttpsError("failed-precondition", "getOtherStreamUserToken must be called while authenticated.");
  }
  // Checking that the user has admin rights.
  if (!request.auth.token.admin) {
    logger.error("getOtherStreamUserToken: user is not an admin");
    throw new HttpsError("permission-denied", "getOtherStreamUserToken can only be used by admin users.");
  }
  // check if the uid of the other user is provided
  if (!request.data?.uid) {
    logger.error("getOtherStreamUserToken: must be called with an uid of the user to get the stream token for");
    throw new HttpsError("invalid-argument", "getOtherStreamUserToken must be called with an uid to get the stream token for.");
  }
  try {
    const _client = getStreamClient();
    const _token = _client.createToken(
      request.data.uid,
      undefined,
      Math.floor(new Date().getTime() / 1000),
    );
    logger.log("getOtherStreamUserToken: stream user token: ", { _token });
    return _token;
  } catch (error) {
    console.error(`getOtherStreamUserToken: unable to get stream user token for ID ${request.data.uid}`, { error });
    throw new HttpsError("aborted", "Could not get stream user token");
  }
});

// Revoke the stream user token for another user (not the currently authenticated user). Requires admin rights.
export const revokeOtherStreamUserToken = onCall({ 
  region: 'europe-west6', 
  cors: true, 
  enforceAppCheck: true,
  secrets: [streamApiKey, streamApiSecret] 
}, async (request) => {
  logger.log("revokeOtherStreamUserToken: revoking stream user token for user ", { uid: request.data?.uid });
  // Checking that the user is authenticated.
  if (!request.auth) {
    logger.error("revokeOtherStreamUserToken: user is not authenticated");
    throw new HttpsError("failed-precondition", "revokeOtherStreamUserToken must be called while authenticated.");
  }
  // Checking that the user has admin rights.
  if (!request.auth.token.admin) {
    logger.error("revokeOtherStreamUserToken: user is not an admin");
    throw new HttpsError("permission-denied", "revokeOtherStreamUserToken can only be used by admin users.");
  }
  // check if the uid of the other user is provided
  if (!request.data?.uid) {
    logger.error("revokeOtherStreamUserToken: must be called with an uid of the user to get the stream token for");
    throw new HttpsError("invalid-argument", "revokeOtherStreamUserToken must be called with an uid to get the stream token for.");
  }

  try {
    const client = getStreamClient();
    const result = await client.revokeUserToken(request.data.uid);
    logger.log("revokeOtherStreamUserToken: stream user token revoked", { result: result });
    return result;
  } catch (error) {
    console.error(`revokeOtherStreamUserToken: unable to revoke stream user token with ID ${request.data.uid}`, { error });
    throw new HttpsError("aborted", "Could not revoke Stream user token");
  }
});

// Create a stream user for another user (not the currently authenticated user). Requires admin rights.
// same as createStreamUser, but callable. This can be used e.g. for pre-existing users.
export const createOtherStreamUser = onCall({ 
  region: 'europe-west6', 
  cors: true, 
  enforceAppCheck: true,
  secrets: [streamApiKey, streamApiSecret] 
}, async (request) => {
  logger.log("createOtherStreamUser: creating stream user ", { uid: request.data?.uid });
  // Checking that the user is authenticated.
  if (!request.auth) {
    logger.error("createOtherStreamUser: user is not authenticated");
    throw new HttpsError("failed-precondition", "createOtherStreamUser must be called while authenticated.");
  }
  // Checking that the user has admin rights.
  if (!request.auth.token.admin) {
    logger.error("createOtherStreamUser: user is not an admin");
    throw new HttpsError("permission-denied", "createOtherStreamUser can only be used by admin users.");
  }
  // check if the uid of the other user is provided
  if (!request.data?.uid) {
    logger.error("createOtherStreamUser: must be called with an uid of the user to create the stream user for");
    throw new HttpsError("invalid-argument", "createOtherStreamUser must be called with an uid to create the stream user for.");
  }

  try {
    const client = getStreamClient();
    const response = await client.upsertUser({
      id: request.data.uid,
      name: request.data.name,
      image: request.data.image,
    });
    logger.log("createOtherStreamUser: stream user created", { response });
    return response;
  } catch (error) {
    console.error(`createOtherStreamUser: unable to create stream user with ID ${request.data.uid}`, { error });
    throw new HttpsError("aborted", "Could not create stream user");
  }
});
