import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import axios from 'axios';
import { defineSecret } from 'firebase-functions/params';

const ipinfoToken = defineSecret('IPINFO_TOKEN');   // load the google cloud secret

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

export const getIpInfo = onCall({ 
  region: 'europe-west6',
  enforceAppCheck: true,
  cors: true 
}, async (request) => {
  logger.log('getIpInfo: ', { data: request.data });
  const token = ipinfoToken.value();
  const ip = request.rawRequest.ip;

  if (!token) {
    logger.error('getIpInfo: IPINFO_TOKEN is not configured as env var.');
    throw new HttpsError('internal', 'The server configuration is incomplete.');
  }

  if (!ip) {
    logger.error('getIpInfo: could not determine client IP address.');
    throw new HttpsError('invalid-argument', 'Could not determine client IP address.');
  }

  try {
    const result = await axios.get(`https://ipinfo.io/${ip}?token=${token}`);
    return result.data;
  } catch (error) {
    logger.error('getIpInfo: error calling ipinfo.io', { error });
    throw new HttpsError('internal', 'An internal server error occurred while fetching IP info.');
  }
});




