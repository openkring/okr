import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import axios from 'axios';
import { defineString } from 'firebase-functions/params';

const ipinfoToken = defineString('IPINFO_TOKEN');   // load the google cloud secret

/**
  * A trivial function to test the cloud function
  */
export const echoHandler = (request, response) => {
  logger.info('entering echoHandler: ', { body: request.body });
  response.status(200).send({
    message: 'Echo erfolgreich!',
    body: request.body,
    headers: request.headers
  });
};

export const getIpInfoHandler = async (request, response) => {
  logger.info('entering getIpInfoHandler');
  const token = ipinfoToken.value();
  // in express, the ip-address is availabl in req.ip or req-headers 
  const ip = request.headers['x-forwarded-for'] ?? request.socket.remoteAddress;

  if (!token) {
    logger.error('IPINFO_TOKEN is not configured as env var.');
    response.status(500).send('wrong server configuration.');
    return;
  }

  try {
    const result = await axios.get(`https://ipinfo.io/${ip}?token=${token}`);
    response.status(200).send(result.data);
  } catch (error) {
    logger.error('error calling ipinfo.io', { error });
    response.status(500).send({ error: 'internal server error' });
  }
};

// 2. Verpacken Sie die Handler mit onRequest für Firebase und exportieren Sie sie.
// Diese werden für direkte Deployments oder den Emulator benötigt.
export const echo = onRequest(echoHandler);
export const getIpInfo = onRequest({ secrets: ['IPINFO_TOKEN'] }, getIpInfoHandler);
