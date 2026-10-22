import type { FileTransferOpenEvent } from '@okr/content-file-transfer-ui';
import { FileTransferView, isFileTransferVideo } from '@okr/content-file-transfer-util';

/** What the page should show after a click: an inline video player, or nothing (a tab/download took over). */
export type FileTransferOpenOutcome = { kind: 'video'; url: string; name: string } | { kind: 'done' };

/**
 * Opens one file of a transfer from a click on the card. MUST be called synchronously from the
 * click handler: a tab for an inline image/pdf is opened BEFORE the await (still inside the user
 * gesture — Safari blocks a window.open after an await), then pointed at the signed URL.
 *
 * - inline video → no tab; the caller embeds a <video> with the returned URL
 * - inline image/pdf → the pre-opened tab
 * - download → navigate to the signed URL; it answers with Content-Disposition: attachment, so the
 *   page stays where it is and the browser saves the file
 *
 * `getUrl` throws on failure; the pre-opened tab is closed again and the error re-thrown.
 */
export async function openFileTransferFile(
  view: FileTransferView,
  event: FileTransferOpenEvent,
  getUrl: (fileIndex: number, disposition: 'inline' | 'attachment') => Promise<string>,
): Promise<FileTransferOpenOutcome> {
  const file = view.files.find(f => f.index === event.fileIndex);
  const isVideo = event.disposition === 'inline' && !!file && isFileTransferVideo(file.contentType);
  const tab = event.disposition === 'inline' && !isVideo ? window.open('', '_blank') : null;
  if (tab) tab.opener = null;
  try {
    const url = await getUrl(event.fileIndex, event.disposition);
    if (isVideo) return { kind: 'video', url, name: file?.name ?? '' };
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    return { kind: 'done' };
  } catch (error) {
    tab?.close();
    throw error;
  }
}
