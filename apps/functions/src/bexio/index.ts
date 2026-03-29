import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';

const bexioApiKey = defineSecret('BEXIO_APIKEY');

const BEXIO_BASE = 'https://api.bexio.com/2.0';

export interface BexioContact {
  id: number;
  name_1: string;          // last name or company name
  name_2: string | null;   // first name (null for companies)
  street_name: string;
  house_number: string;
  postcode: string;
  city: string;
  mail: string
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
    secrets: [bexioApiKey],
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

    logger.info(`${CF_NAME}: creating contact "${name_1}"`);

    try {
      const response = await axios.post<BexioContact>(
        `${BEXIO_BASE}/contact`,
        { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: created contact with id ${response.data.id}`);
      return { id: response.data.id };
    } catch (error: unknown) {
      logger.error(`${CF_NAME}: error`, error);
      throw new HttpsError('internal', 'Bexio contact creation failed');
    }
  }
);

/**
 * Fetch all contacts from the Bexio API.
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

    logger.info(`${CF_NAME}: fetching contacts`);

    try {
      const response = await axios.get<BexioContact[]>(`${BEXIO_BASE}/contact`, {
        headers: {
          'Authorization': `Bearer ${bexioApiKey.value()}`,
          'Accept': 'application/json',
        },
      });

      const contacts = Array.isArray(response.data) ? response.data : [];
      logger.info(`${CF_NAME}: fetched ${contacts.length} contacts`);

      return contacts.map(c => ({
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
