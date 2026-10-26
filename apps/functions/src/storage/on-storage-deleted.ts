import { onObjectDeleted, type StorageEvent } from 'firebase-functions/v2/storage';

import { runHandlers, type NamedHandler } from '../_fanout';
import { geminiApiKey } from '../ocr';
import { handleRagFileDeleted } from '../rag';
import { handleAlbumSourceDeleted } from '../video';

/**
 * The two former default-bucket delete triggers (`onRagFileDeleted`, `onAlbumSourceDeleted`), one handler
 * each. Every handler gets the same event and returns early on a path that is not its own.
 */
export const STORAGE_DELETED_HANDLERS: NamedHandler<StorageEvent>[] = [
  { name: 'rag', run: handleRagFileDeleted },
  { name: 'albumSource', run: handleAlbumSourceDeleted },
];

export const onStorageDeleted = onObjectDeleted(
  {
    region: 'europe-west6',
    memory: '256MiB',
    cpu: 1,
    concurrency: 10,
    timeoutSeconds: 60,
    maxInstances: 10,
    secrets: [geminiApiKey, 'SENTRY_FUNCTIONS_DSN'],
  },
  async (event) => {
    await runHandlers('onStorageDeleted', event, STORAGE_DELETED_HANDLERS);
  },
);
