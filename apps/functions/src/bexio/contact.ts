import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';

import { bexioApiKey, bexioUserId, BEXIO_BASE } from './shared';

export interface BexioContact {
  id: number;
  name_1: string;          // last name or company name
  name_2: string | null;   // first name (null for companies)
  street_name: string;
  house_number: string;
  postcode: string;
  city: string;
  mail: string;
  contact_type_id: number; // 1=company, 2=person
}

/**
 * Create a new contact in the Bexio API.
 * Returns the newly assigned Bexio contact ID.
 */
export const createBexioContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioUserId],
  },
  async (request: CallableRequest<{ name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number }>) => {
    const CF_NAME = 'createBexioContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id } = request.data;
    if (!name_1) {
      throw new HttpsError('invalid-argument', 'name_1 is required');
    }

    const userId = parseInt(bexioUserId.value(), 10);
    logger.info(`${CF_NAME}: creating contact "${name_1}" by bexio user ${userId}`);

    try {
      const response = await axios.post<BexioContact>(
        `${BEXIO_BASE}/contact`,
        { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id, user_id: userId, owner_id: userId },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: created contact with id ${response.data.id}`);
      return { id: String(response.data.id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio contact creation failed');
    }
  }
);

/**
 * Update an existing contact in the Bexio API.
 */
export const updateBexioContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioUserId],
  },
  async (request: CallableRequest<{ id: string; name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number }>) => {
    const CF_NAME = 'updateBexioContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { id, name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id } = request.data;
    if (!id || !name_1) {
      throw new HttpsError('invalid-argument', 'id and name_1 are required');
    }

    const userId = parseInt(bexioUserId.value(), 10);
    logger.info(`${CF_NAME}: updating contact ${id} "${name_1}"`);

    try {
      await axios.post<BexioContact>(
        `${BEXIO_BASE}/contact/${id}`,
        { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id, user_id: userId, owner_id: userId },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: updated contact ${id}`);
      return { id: String(id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio contact update failed');
    }
  }
);

/**
 * Fetch all contacts from the Bexio API using pagination.
 * The API key is stored securely as a GCP secret (BEXIO_APIKEY).
 */
export const getBexioContacts = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey],
  },
  async (request: CallableRequest) => {
    const CF_NAME = 'getBexioContacts';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    logger.info(`${CF_NAME}: fetching all contacts (paginated)`);

    const PAGE_SIZE = 500;
    const allContacts: BexioContact[] = [];

    try {
      let offset = 0;
      while (true) {
        const response = await axios.get<BexioContact[]>(`${BEXIO_BASE}/contact`, {
          params: { limit: PAGE_SIZE, offset },
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
          },
        });

        const page = Array.isArray(response.data) ? response.data : [];
        allContacts.push(...page);
        logger.info(`${CF_NAME}: fetched page offset=${offset}, got ${page.length} contacts`);

        if (page.length < PAGE_SIZE) break; // last page
        offset += PAGE_SIZE;
      }

      logger.info(`${CF_NAME}: total ${allContacts.length} contacts`);

      return allContacts.map(c => ({
        id: c.id,
        name_1: c.name_1,
        name_2: c.name_2,
        street_name: c.street_name,
        house_number: c.house_number,
        postcode: c.postcode,
        city: c.city,
        mail: c.mail,
        contact_type_id: c.contact_type_id
      }));
    } catch (error: unknown) {
      logger.error(`${CF_NAME}: error`, error);
      throw new HttpsError('internal', 'Bexio API request failed');
    }
  }
);
