import { InjectionToken } from '@angular/core';

import type { StorageBucket } from '@okr/shared-config';
import type { ImageStyle } from '@okr/shared-models';

/** One file to upload to Firebase Storage. */
export interface UploadEntry {
  file: File;
  fullPath: string;
  /** Target bucket; 'private' = write-only for clients, result is the fullPath (spec 1.82). */
  bucket?: StorageBucket;
}

/**
 * The UI an upload needs: the progress modal that runs the uploads, and the zoomed image view.
 * Both are shared-ui modals, which a data-access lib (UploadService) must not import, so it injects
 * this instead. shared-ui implements it (UploadPresenterService) and every app binds it once via
 * `provideModelSelector()` from `@okr/shared-feature`.
 */
export interface UploadPresenter {
  /** Runs the uploads in the progress modal; the download URLs (or private paths), undefined when cancelled. */
  runUploads(uploads: UploadEntry[], title: string): Promise<(string | undefined)[] | undefined>;
  showZoomedImage(url: string, title: string, style: ImageStyle, altText: string, cssClass: string): Promise<void>;
}

export const UPLOAD_PRESENTER = new InjectionToken<UploadPresenter>('UploadPresenter');
