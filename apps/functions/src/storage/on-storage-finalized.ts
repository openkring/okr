import { onObjectFinalized, type StorageEvent } from 'firebase-functions/v2/storage';

import { runHandlers, type NamedHandler } from '../_fanout';
import { handleOcrFileFinalized, geminiApiKey } from '../ocr';
import { handleRagFileCreated } from '../rag';

/**
 * The two former default-bucket finalize triggers (`onOcrFileFinalized`, `onRagFileCreated`), one handler
 * each. Every handler gets the same event and returns early on a path that is not its own.
 */
export const STORAGE_FINALIZED_HANDLERS: NamedHandler<StorageEvent>[] = [
  { name: 'ocr', run: handleOcrFileFinalized },
  { name: 'rag', run: handleRagFileCreated },
];

export const onStorageFinalized = onObjectFinalized(
  // 1GiB is OCR's requirement (OOM at 256MiB, see handleOcrFileFinalized); RAG needs less but shares it.
  { region: 'europe-west6', secrets: [geminiApiKey], memory: '1GiB' },
  async (event) => {
    await runHandlers('onStorageFinalized', event, STORAGE_FINALIZED_HANDLERS);
  },
);
