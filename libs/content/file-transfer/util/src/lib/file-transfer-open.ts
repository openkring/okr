import { FileTransferView } from './file-transfer-api';
import { isFileTransferVideo } from './file-transfer-format';

/** A click on a file of a transfer card: view it inline (video, image, pdf) or download it. */
export interface FileTransferOpenEvent {
  fileIndex: number;
  disposition: 'inline' | 'attachment';
}

/** What the page should show after a click: an inline video player, or nothing (a tab/download took over). */
export type FileTransferOpenOutcome = { kind: 'video'; url: string; name: string } | { kind: 'done' };

export interface FileTransferOpenOptions {
  /**
   * true: an inline video opens in its own tab like an image/pdf (the chat has no room for a
   * player under the card). Default false: the caller embeds a <video> with the returned URL.
   */
  videoInTab?: boolean;
}

/**
 * Opens one file of a transfer from a click on the card. MUST be called synchronously from the
 * click handler: a tab for an inline file is opened BEFORE the await (still inside the user
 * gesture — Safari blocks a window.open after an await), then pointed at the signed URL.
 *
 * - inline video → no tab; the caller embeds a <video> with the returned URL (unless `videoInTab`)
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
  options: FileTransferOpenOptions = {},
): Promise<FileTransferOpenOutcome> {
  const file = view.files.find(f => f.index === event.fileIndex);
  const isVideo = event.disposition === 'inline' && !!file && isFileTransferVideo(file.contentType) && !options.videoInTab;
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
