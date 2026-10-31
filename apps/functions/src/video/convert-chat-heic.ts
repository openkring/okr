import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import convert from 'heic-convert';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { checkRateLimit } from '../matrix-simple/shared';
import { CHAT_JPEG_QUALITY, jpegFileName, validateChatHeicRequest } from './chat-image.util';

const CF_NAME = 'convertChatHeic';
/** Burst brake per user and instance: room for a batch of photos, not for a decode loop. */
const MAX_CONVERSIONS_PER_MINUTE = 30;

export interface ChatHeicConversion {
  fileName: string;
  /** The JPEG, base64-encoded. */
  data: string;
}

/**
 * HEIC → JPEG for chat photos sent from a browser that cannot decode HEIC itself (Chrome, Firefox,
 * Android — every browser but Safari). Matrix media bypasses Storage and imgix, so without this a
 * Samsung or iPhone HEIC lands in the room as `image/heic` and renders blank for everyone not on
 * Safari. Stateless: the bytes come in, the JPEG goes back, nothing is stored or logged.
 *
 * libheif (LGPL-3.0, via heic-convert) runs here rather than in the app on purpose — it keeps
 * 1.4 MB of WASM and the only LGPL dependency out of the client bundle (see `convertHeicToJpeg`
 * in chat-util). libheif applies the image's rotation, and the JPEG carries no EXIF, so GPS
 * coordinates in the original never reach the room.
 */
export const convertChatHeic = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true, memory: '1GiB', timeoutSeconds: 60, maxInstances: 5 },
  async (request: CallableRequest<unknown>): Promise<ChatHeicConversion> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    checkRateLimit(request.auth?.uid ?? '', CF_NAME, MAX_CONVERSIONS_PER_MINUTE);
    const req = validateChatHeicRequest(request.data);

    let jpeg: Uint8Array;
    try {
      jpeg = await convert({ buffer: req.bytes, format: 'JPEG', quality: CHAT_JPEG_QUALITY });
    } catch (error) {
      logger.warn(`${CF_NAME}: libheif could not decode the image`, { size: req.bytes.length, error: String(error) });
      throw new HttpsError('invalid-argument', 'The image could not be decoded.');
    }
    logger.info(`${CF_NAME}: converted ${req.bytes.length} → ${jpeg.length} bytes`);
    return { fileName: jpegFileName(req.fileName), data: Buffer.from(jpeg).toString('base64') };
  },
);
