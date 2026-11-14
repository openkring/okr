import { TrackPhoto } from '@okr/shared-models';
import { trackPhotoFiles, trackPhotoImageFields } from '@okr/travel-journal-util';

import { ChangeDraft } from './journal-identity.service';
import { JournalPhotos } from './journal-photos.plugin';

/** The image records of the imported photos, their keys by PhotoKit id, the written files and how many were skipped. */
export interface ImportedTrackPhotos {
  drafts: ChangeDraft[];
  keys: Record<string, string>; // assetId → image key
  files: string[]; // file names in Documents/journals/<journalKey>/
  skipped: number;
}

/**
 * A recorded track's photos into the journal as images, by their PhotoKit id (spec 1.154 decision 8, 1.121 §6): a 2048 px
 * and a 400 px JPEG through the plugin's original export — the renditions the picker writes. Used by the iPad's «Strecke
 * wählen» and by the iPhone's «An Reisetagebuch senden». A photo this device's library does not have (taken on another
 * device, outside a limited selection, iCloud offline) is skipped; a half-written pair is removed.
 */
export async function importTrackPhotos(journalKey: string, photos: TrackPhoto[]): Promise<ImportedTrackPhotos> {
  const drafts: ChangeDraft[] = [];
  const keys: Record<string, string> = {};
  const names: string[] = [];
  let skipped = 0;
  for (const photo of photos) {
    const name = crypto.randomUUID();
    const [file2048, file400] = trackPhotoFiles([name]);
    try {
      const large = await JournalPhotos.exportOriginal({ journalKey, localIdentifier: photo.assetId, file: file2048, fillLongPx: 2048, fillShortPx: 1 });
      if ('skipped' in large) {
        skipped++;
        continue;
      }
      const small = await JournalPhotos.exportOriginal({ journalKey, localIdentifier: photo.assetId, file: file400, fillLongPx: 400, fillShortPx: 1 });
      if ('skipped' in small) {
        await JournalPhotos.deleteFile({ journalKey, file: file2048 }).catch(() => undefined);
        skipped++;
        continue;
      }
      const key = crypto.randomUUID();
      keys[photo.assetId] = key;
      names.push(name);
      drafts.push({
        journalKey, entity: 'image', entityKey: key, op: 'create',
        fields: trackPhotoImageFields(journalKey, photo, name, { width: large.width, height: large.height }),
      });
    } catch (error) {
      console.warn('journal: a track photo could not be imported', photo.assetId, error);
      for (const file of [file2048, file400]) await JournalPhotos.deleteFile({ journalKey, file }).catch(() => undefined);
      skipped++;
    }
  }
  return { drafts, keys, files: trackPhotoFiles(names), skipped };
}
