import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

/**
  * A trivial function to test the cloud function.
  * Data sent from the client is available in request.data.
  */
export const getEcho = onCall({ 
  region: 'europe-west6',
  enforceAppCheck: true,
  cors: true 
}, (request) => {
  logger.log('getEcho: ', { data: request.data });
  if (!request.auth) {
    logger.error('getEcho: user is not authenticated');
    throw new HttpsError('failed-precondition', 'getEcho must be called while authenticated.');
  }
  return {
    message: 'The cloud function was called successfully.',
    data: request.data,
  };
});
